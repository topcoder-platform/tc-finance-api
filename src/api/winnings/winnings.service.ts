import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  Prisma,
  payment,
  payment_method_status,
  payment_status,
  winnings_category,
  winnings_type,
} from '@prisma/client';

import { PrismaService } from 'src/shared/global/prisma.service';

import {
  WinningCreateRequestDto,
  WinningsCategory,
  WinningsType,
} from 'src/dto/winning.dto';
import { ResponseDto } from 'src/dto/api-response.dto';
import { PaymentCreateRequestDto, PaymentStatus } from 'src/dto/payment.dto';
import { OriginRepository } from '../repository/origin.repo';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';
import { BASIC_MEMBER_FIELDS } from 'src/shared/topcoder';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';
import { TopcoderEmailService } from 'src/shared/topcoder/tc-email.service';
import { IdentityVerificationRepository } from '../repository/identity-verification.repo';
import { PrizeType } from '../challenges/models';
import { BillingAccountsService } from 'src/shared/topcoder/billing-accounts.service';
import { TopcoderEngagementsService } from 'src/shared/topcoder/engagements.service';
import { TopcoderM2MHttpError } from 'src/shared/topcoder/topcoder-m2m.service';

const BUDGET_LEDGER_DECIMAL_PLACES = 4;

interface EngagementBillingAccountConsume {
  amount: number;
  billingAccountId: number;
  detailIndex: number;
}

interface EngagementBillingAccountConsumePlan {
  assignmentId: string;
  billingAccountId: number;
  consumes: EngagementBillingAccountConsume[];
}

/**
 * The winning service.
 */
@Injectable()
export class WinningsService {
  private readonly logger = new Logger(WinningsService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   * @param taxFormRepo repository for tax form checks.
   * @param paymentMethodRepo repository for member payment method checks.
   * @param originRepo repository for winning origin lookup.
   * @param tcMembersService Topcoder member profile client.
   * @param identityVerificationRepo repository for identity verification checks.
   * @param tcEmailService Topcoder email client.
   * @param topcoderEngagementsService Topcoder engagements client.
   * @param billingAccountsService Topcoder billing-account client.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly originRepo: OriginRepository,
    private readonly tcMembersService: TopcoderMembersService,
    private readonly identityVerificationRepo: IdentityVerificationRepository,
    private readonly tcEmailService: TopcoderEmailService,
    private readonly topcoderEngagementsService: TopcoderEngagementsService,
    private readonly billingAccountsService: BillingAccountsService,
  ) {}

  /**
   * Builds the persisted winning attributes object.
   * @param attributes Arbitrary attributes supplied by the client.
   * @param hoursWorked Optional engagement-payment hours to persist.
   * @returns The normalized attributes object, or `undefined` when empty.
   */
  private buildWinningAttributes(
    attributes: Record<string, unknown> | undefined,
    hoursWorked?: number,
  ): Prisma.InputJsonValue | undefined {
    const normalizedAttributes: Record<string, unknown> =
      attributes && typeof attributes === 'object' && !Array.isArray(attributes)
        ? { ...attributes }
        : {};

    if (hoursWorked !== undefined) {
      normalizedAttributes.hoursWorked = hoursWorked;
    }

    return Object.keys(normalizedAttributes).length
      ? (normalizedAttributes as Prisma.InputJsonObject)
      : undefined;
  }

  /**
   * Resolves the engagement assignment id used as the billing-account external
   * reference.
   *
   * @param body incoming winning creation request.
   * @returns normalized assignment id from `externalId`.
   * @throws BadRequestException when `externalId` is missing or does not match
   * `attributes.assignmentId` when both are supplied.
   */
  private normalizeEngagementAssignmentId(
    body: WinningCreateRequestDto,
  ): string {
    const externalId = String(body.externalId ?? '').trim();

    if (!externalId) {
      throw new BadRequestException(
        'externalId is required for engagement payments',
      );
    }

    const attributes =
      body.attributes &&
      typeof body.attributes === 'object' &&
      !Array.isArray(body.attributes)
        ? (body.attributes as Record<string, unknown>)
        : undefined;
    const rawAssignmentId = attributes?.assignmentId;
    let assignmentId: string | undefined;

    if (rawAssignmentId !== undefined && rawAssignmentId !== null) {
      if (
        typeof rawAssignmentId !== 'string' &&
        typeof rawAssignmentId !== 'number'
      ) {
        throw new BadRequestException(
          'attributes.assignmentId must be a string or number for engagement payments',
        );
      }

      assignmentId = String(rawAssignmentId).trim();
    }

    if (assignmentId && assignmentId !== externalId) {
      throw new BadRequestException(
        'attributes.assignmentId must match externalId for engagement payments',
      );
    }

    return externalId;
  }

  /**
   * Normalizes the billing account id from an engagement payment detail.
   *
   * @param detail payment detail supplied in the winning request.
   * @param detailIndex zero-based detail index for error reporting.
   * @returns positive integer billing account id.
   * @throws BadRequestException when the detail cannot be mapped to an id.
   */
  private normalizeEngagementBillingAccountId(
    detail: PaymentCreateRequestDto,
    detailIndex: number,
  ): number {
    const rawBillingAccount = String(detail.billingAccount ?? '').trim();
    const billingAccountId = Number(rawBillingAccount);

    if (
      !rawBillingAccount ||
      !/^\d+$/.test(rawBillingAccount) ||
      !Number.isSafeInteger(billingAccountId) ||
      billingAccountId <= 0
    ) {
      throw new BadRequestException(
        `details[${detailIndex}].billingAccount must be a valid billing account id`,
      );
    }

    return billingAccountId;
  }

  /**
   * Normalizes a trusted billing account id returned by engagements-api-v6.
   *
   * @param billingAccountId billing account id from the assignment context.
   * @returns positive integer billing account id, or `null` when the project has
   * no configured billing account.
   * @throws InternalServerErrorException when the assignment context contains a
   * malformed billing account id.
   */
  private normalizeTrustedBillingAccountId(
    billingAccountId: unknown,
  ): number | null {
    if (billingAccountId === undefined || billingAccountId === null) {
      return null;
    }

    if (
      typeof billingAccountId !== 'string' &&
      typeof billingAccountId !== 'number'
    ) {
      throw new InternalServerErrorException(
        'Engagement assignment billing account id has invalid type',
      );
    }

    const normalizedBillingAccountId = String(billingAccountId).trim();

    if (!/^\d+$/.test(normalizedBillingAccountId)) {
      throw new InternalServerErrorException(
        'Engagement assignment billing account id is invalid',
      );
    }

    const parsedBillingAccountId = Number(normalizedBillingAccountId);

    if (
      !Number.isSafeInteger(parsedBillingAccountId) ||
      parsedBillingAccountId <= 0
    ) {
      throw new InternalServerErrorException(
        'Engagement assignment billing account id is invalid',
      );
    }

    return parsedBillingAccountId;
  }

  /**
   * Resolves the assignment's billing account from trusted backend context.
   *
   * Finance validates caller-supplied payment details against this value before
   * it attempts any billing-account budget consume.
   *
   * @param assignmentId engagement assignment id.
   * @returns trusted billing account id for the assignment's project.
   * @throws BadRequestException when the assignment is missing or its project
   * has no configured billing account.
   * @throws InternalServerErrorException when engagements-api-v6 cannot be read.
   */
  private async resolveTrustedAssignmentBillingAccountId(
    assignmentId: string,
  ): Promise<number> {
    try {
      const assignmentContext =
        await this.topcoderEngagementsService.getAssignmentContextById(
          assignmentId,
        );
      const billingAccountId = this.normalizeTrustedBillingAccountId(
        assignmentContext.billingAccountId,
      );

      if (billingAccountId === null) {
        throw new BadRequestException(
          'No billing account is configured for engagement assignment',
        );
      }

      return billingAccountId;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof TopcoderM2MHttpError && error.status === 404) {
        throw new BadRequestException('Engagement assignment not found');
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to resolve trusted billing account for engagement assignment ${assignmentId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to resolve engagement assignment billing account',
      );
    }
  }

  /**
   * Quantizes a computed consume amount to the billing ledger scale.
   *
   * billing-accounts-api-v6 persists budget rows as `Decimal(20,4)`, so finance
   * sends engagement consume amounts already rounded to that same four-decimal
   * contract.
   *
   * @param amount Decimal amount to normalize.
   * @returns JavaScript number with at most four fractional digits for JSON
   * transport.
   */
  private toBillingLedgerAmount(amount: Prisma.Decimal): number {
    return Number(
      amount
        .toDecimalPlaces(
          BUDGET_LEDGER_DECIMAL_PLACES,
          Prisma.Decimal.ROUND_HALF_UP,
        )
        .toFixed(BUDGET_LEDGER_DECIMAL_PLACES),
    );
  }

  /**
   * Computes an engagement consume amount with decimal-safe arithmetic.
   *
   * @param totalAmount payment detail total amount.
   * @param markup billing-account markup.
   * @param detailIndex zero-based detail index for error reporting.
   * @returns Ledger-scale consume amount including markup.
   * @throws BadRequestException when the detail amount is invalid.
   * @throws InternalServerErrorException when the markup or computed value is
   * not finite.
   */
  private calculateEngagementConsumeAmount(
    totalAmount: number,
    markup: number,
    detailIndex: number,
  ): number {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw new BadRequestException(
        `details[${detailIndex}].totalAmount must be a non-negative number`,
      );
    }

    if (!Number.isFinite(markup)) {
      throw new InternalServerErrorException(
        'Engagement billing account has invalid markup',
      );
    }

    const totalAmountDecimal = new Prisma.Decimal(totalAmount);
    const markupDecimal = new Prisma.Decimal(markup);
    const consumeAmount = totalAmountDecimal.plus(
      totalAmountDecimal.mul(markupDecimal),
    );
    const ledgerAmount = this.toBillingLedgerAmount(consumeAmount);

    if (!Number.isFinite(ledgerAmount)) {
      throw new InternalServerErrorException(
        `Failed to compute billing account consume amount for details[${detailIndex}]`,
      );
    }

    return ledgerAmount;
  }

  /**
   * Checks whether an engagement payment billing account should bypass
   * billing-account budget enforcement.
   *
   * @param billingAccountId normalized billing account id from a payment
   * detail.
   * @returns `true` when the id is listed in `ENV_CONFIG.TGBillingAccounts`.
   */
  private isTopGearBillingAccount(billingAccountId: number): boolean {
    return ENV_CONFIG.TGBillingAccounts.includes(billingAccountId);
  }

  /**
   * Builds the batch billing-account consume plan for non-exempt engagement
   * payment billing accounts.
   *
   * @param body incoming winning creation request.
   * @returns assignment id, trusted billing account id, and typed consume
   * requests to execute for non-TopGear billing accounts.
   * @throws BadRequestException when engagement payment input is invalid.
   * @throws InternalServerErrorException when billing-account metadata cannot
   * be normalized into a finite markup.
   */
  private async buildEngagementBillingAccountConsumePlan(
    body: WinningCreateRequestDto,
  ): Promise<EngagementBillingAccountConsumePlan> {
    const assignmentId = this.normalizeEngagementAssignmentId(body);

    if (!body.details?.length) {
      throw new BadRequestException(
        'At least one payment detail is required for engagement payments',
      );
    }

    const trustedBillingAccountId =
      await this.resolveTrustedAssignmentBillingAccountId(assignmentId);

    body.details.forEach((detail, detailIndex) => {
      const suppliedBillingAccountId = this.normalizeEngagementBillingAccountId(
        detail,
        detailIndex,
      );

      if (suppliedBillingAccountId !== trustedBillingAccountId) {
        throw new BadRequestException(
          `details[${detailIndex}].billingAccount does not match the assignment billing account`,
        );
      }
    });

    if (this.isTopGearBillingAccount(trustedBillingAccountId)) {
      this.logger.info(
        'Ignore BA validation for Topgear account:',
        trustedBillingAccountId,
      );
      return {
        assignmentId,
        billingAccountId: trustedBillingAccountId,
        consumes: [],
      };
    }

    let billingAccount: { id: number; markup: number };

    try {
      billingAccount = await this.billingAccountsService.getBillingAccountById(
        trustedBillingAccountId,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to read billing account metadata',
      );
    }

    if (!Number.isFinite(billingAccount.markup)) {
      throw new InternalServerErrorException(
        `Billing account ${billingAccount.id} has invalid markup`,
      );
    }

    if (billingAccount.id !== trustedBillingAccountId) {
      throw new InternalServerErrorException(
        `Billing account ${trustedBillingAccountId} returned mismatched metadata`,
      );
    }

    const consumes = body.details.reduce<EngagementBillingAccountConsume[]>(
      (consumePlan, detail, detailIndex) => {
        consumePlan.push({
          amount: this.calculateEngagementConsumeAmount(
            Number(detail.totalAmount),
            billingAccount.markup,
            detailIndex,
          ),
          billingAccountId: trustedBillingAccountId,
          detailIndex,
        });

        return consumePlan;
      },
      [],
    );

    return {
      assignmentId,
      billingAccountId: trustedBillingAccountId,
      consumes,
    };
  }

  /**
   * Extracts a client-safe message from a thrown Nest exception.
   *
   * @param error thrown error.
   * @param fallback fallback message when the exception body is not readable.
   * @returns normalized exception message.
   */
  private getExceptionMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (response && typeof response === 'object') {
        const message = (response as { message?: string | string[] }).message;

        if (Array.isArray(message)) {
          return message.join(', ');
        }

        if (message) {
          return message;
        }
      }
    }

    return error instanceof Error ? error.message : fallback;
  }

  /**
   * Rethrows billing-account consume failures with the HTTP contract expected
   * by `/winnings`.
   *
   * @param error error thrown while consuming billing-account budget.
   * @throws BadRequestException when billing accounts rejects the consume as a
   * client-visible validation failure.
   * @throws HttpException for other upstream HTTP failures.
   * @throws InternalServerErrorException for transport or unexpected failures.
   */
  private throwEngagementConsumeError(error: unknown): never {
    if (error instanceof HttpException) {
      if (error.getStatus() === 400) {
        throw new BadRequestException(
          this.getExceptionMessage(
            error,
            'Failed to consume engagement billing account budget',
          ),
        );
      }

      throw error;
    }

    throw new InternalServerErrorException(
      'Failed to consume engagement billing account budget',
    );
  }

  /**
   * Executes typed engagement consumes against non-exempt billing accounts in
   * one atomic upstream batch.
   *
   * @param consumePlan assignment id and per-detail consume requests.
   * @returns promise resolved after the batch consume succeeds.
   * @throws BadRequestException when billing accounts reports insufficient
   * funds or another client-visible consume error.
   * @throws HttpException for non-400 upstream billing-account failures.
   */
  private async consumeEngagementBillingAccounts(
    consumePlan: EngagementBillingAccountConsumePlan,
  ): Promise<void> {
    if (!consumePlan.consumes.length) {
      return;
    }

    try {
      await this.billingAccountsService.consumeAmounts({
        consumes: consumePlan.consumes.map((consume) => ({
          amount: consume.amount,
          billingAccountId: consume.billingAccountId,
          externalId: consumePlan.assignmentId,
          externalType: 'ENGAGEMENT',
        })),
      });
    } catch (error) {
      this.logger.error(
        `Failed to consume billing account budget for engagement payment ${consumePlan.assignmentId}`,
        error,
      );
      this.throwEngagementConsumeError(error);
    }
  }

  private async sendSetupEmailNotification(userId: string, amount: number) {
    this.logger.debug(`Fetching member info for user handle: ${userId}`);
    const member = await this.tcMembersService.getMemberInfoByUserId(userId, {
      fields: BASIC_MEMBER_FIELDS,
    });

    if (!member) {
      this.logger.warn(
        `No member information found for user handle: ${userId}`,
      );
      return;
    }

    this.logger.debug(
      `Member info retrieved successfully for user: ${userId}`,
      { member },
    );

    this.logger.debug(
      `Preparing to send payment setup reminder email to: ${member.email}`,
    );

    try {
      await this.tcEmailService.sendEmail(
        member.email,
        ENV_CONFIG.SENDGRID_TEMPLATE_ID_PAYMENT_SETUP_NOTIFICATION,
        {
          data: {
            user_name: member.firstName || member.handle || member.lastName,
            amount_won: amount,
            wallet_link: `${ENV_CONFIG.TOPCODER_WALLET_URL}#payout`,
          },
        },
      );

      this.logger.debug(
        `Payment setup reminder email sent successfully to: ${member.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send payment setup reminder email to: ${member.email}. Error: ${error.message}`,
        error,
      );
    }
  }

  private async setPayrollPaymentMethod(
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const payrollPaymentMethod = await (
      tx || this.prisma
    ).payment_method.findFirst({
      where: {
        payment_method_type: 'Wipro Payroll',
      },
    });

    if (!payrollPaymentMethod) {
      this.logger.error(`Failed to retrieve Wipro Payroll payment method!`);
      return;
    }

    if (
      await (tx || this.prisma).user_payment_methods.findFirst({
        where: {
          user_id: userId,
          payment_method_id: payrollPaymentMethod.payment_method_id,
        },
      })
    ) {
      return;
    }

    this.logger.debug(`Enrolling wipro user ${userId} with Wipro Payroll.`);

    try {
      await this.prisma.user_payment_methods.create({
        data: {
          user_id: userId,
          status: payment_method_status.CONNECTED,
          payment_method_id: payrollPaymentMethod.payment_method_id,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to enroll wipro user ${userId} with Wipro Payrol! ${error.message}`,
        error,
      );
    }
  }

  /**
   * Create winnings with parameters. Engagement payment requests are gated by
   * billing-account budget consumption before the transaction can complete.
   *
   * @param body the request body
   * @param userId the request userId
   * @returns the Promise with response result
   * @throws BadRequestException when engagement payment budget consume fails or
   * engagement payment input is invalid.
   */
  async createWinningWithPayments(
    body: WinningCreateRequestDto,
    userId: string,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();
    const isEngagementPayment =
      body.category === WinningsCategory.ENGAGEMENT_PAYMENT;
    const engagementConsumePlan = isEngagementPayment
      ? await this.buildEngagementBillingAccountConsumePlan(body)
      : undefined;
    let setupEmailNotificationAmount: number | undefined;

    this.logger.debug(
      `Creating winning with payments for user ${body.winnerId}`,
      body,
    );

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const originId = await this.originRepo.getOriginIdByName(body.origin, tx);

      if (!originId) {
        this.logger.warn('Invalid origin provided', { originId });

        result.error = {
          code: HttpStatus.BAD_REQUEST,
          message: 'Origin name does not exist',
        };
        return result;
      }

      // check if any of: type, category or currency is using POINTS system
      // if so, and the others are not matching the expectation, throw error
      if (
        (body.type === WinningsType.POINTS ||
          body.category === WinningsCategory.POINTS_AWARD ||
          body.details.some((p) => String(p.currency) === 'POINT')) &&
        (body.type !== WinningsType.POINTS ||
          body.category !== WinningsCategory.POINTS_AWARD ||
          !body.details.some((p) => String(p.currency) === 'POINT'))
      ) {
        const isTypePoints = body.type === WinningsType.POINTS;
        const isCategoryPoints =
          body.category === WinningsCategory.POINTS_AWARD;
        const hasPointsCurrency = body.details.some(
          (p) => String(p.currency) === 'POINT',
        );

        const mismatches: string[] = [];
        if (!isTypePoints) mismatches.push(`type (got: ${body.type})`);
        if (!isCategoryPoints)
          mismatches.push(`category (got: ${body.category})`);
        if (!hasPointsCurrency)
          mismatches.push(
            `currency (currencies: ${body.details
              .map((d) => d.currency)
              .join(', ')})`,
          );

        this.logger.warn(
          `Inconsistent POINTS winning: ${mismatches.join(', ')}`,
          { body },
        );
        result.error = {
          code: HttpStatus.BAD_REQUEST,
          message: `Invalid winning: POINTS mismatch for ${mismatches.join(
            ', ',
          )}`,
        };
        return result;
      }

      const resolvedType = isEngagementPayment
        ? WinningsType.PAYMENT
        : body.type;

      if (isEngagementPayment && body.type !== WinningsType.PAYMENT) {
        this.logger.warn('Engagement payment type overridden to PAYMENT.', {
          winnerId: body.winnerId,
          externalId: body.externalId,
          requestedType: body.type,
        });
      }

      const winningModel = {
        winner_id: body.winnerId,
        type: winnings_type[resolvedType],
        origin_id: originId,
        category: winnings_category[body.category],
        title: body.title,
        description: body.description,
        external_id: body.externalId,
        attributes: this.buildWinningAttributes(
          body.attributes as Record<string, unknown> | undefined,
          body.hoursWorked,
        ),
        created_by: userId,
        payment: {
          create: [] as Pick<
            payment,
            | 'gross_amount'
            | 'total_amount'
            | 'installment_number'
            | 'currency'
            | 'net_amount'
            | 'payment_status'
            | 'created_by'
            | 'billing_account'
            | 'challenge_fee'
          >[],
        },
      };

      this.logger.debug('Constructed winning model', { winningModel });

      const requestAttributes = body.attributes as
        | Record<string, unknown>
        | undefined;
      const payrollPayment = requestAttributes?.payroll === true;
      const isPointsAward = body.category === WinningsCategory.POINTS_AWARD;
      const requestedStatus = body.status as payment_status | undefined;

      const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(
        body.winnerId,
        tx,
      );
      const hasConnectedPaymentMethod = Boolean(
        await this.paymentMethodRepo.getConnectedPaymentMethod(
          body.winnerId,
          tx,
        ),
      );
      const isIdentityVerified =
        await this.identityVerificationRepo.completedIdentityVerification(
          body.winnerId,
          tx,
        );

      for (const detail of body.details || []) {
        const paymentModel = {
          gross_amount: Prisma.Decimal(detail.grossAmount),
          total_amount: Prisma.Decimal(detail.totalAmount),
          installment_number: detail.installmentNumber,
          currency: PrizeType[detail.currency],
          net_amount: Prisma.Decimal(0),
          payment_status: '' as payment_status,
          created_by: userId,
          billing_account: engagementConsumePlan
            ? String(engagementConsumePlan.billingAccountId)
            : detail.billingAccount,
          challenge_fee: Prisma.Decimal(detail.challengeFee ?? 0),
        };

        paymentModel.net_amount = Prisma.Decimal(detail.grossAmount);
        let resolvedStatus: payment_status;
        if (requestedStatus) {
          resolvedStatus = requestedStatus;
        } else {
          resolvedStatus =
            hasConnectedPaymentMethod && hasActiveTaxForm && isIdentityVerified
              ? PaymentStatus.OWED
              : PaymentStatus.ON_HOLD;

          if (payrollPayment) {
            this.logger.debug(
              `Payroll payment detected. Setting payment status to PAID for user ${body.winnerId}`,
            );
            resolvedStatus = PaymentStatus.PAID;
          } else if (body.category === WinningsCategory.POINTS_AWARD) {
            resolvedStatus = payment_status.CREDITED;
          }
        }

        if (payrollPayment) {
          if (requestedStatus) {
            this.logger.debug(
              `Payroll payment detected. Preserving requested payment status ${requestedStatus} for user ${body.winnerId}`,
            );
          }
          await this.setPayrollPaymentMethod(body.winnerId, tx);
        }

        paymentModel.payment_status = resolvedStatus;

        winningModel.payment.create.push(paymentModel);
        this.logger.debug('Added payment model to winning model', {
          paymentModel,
        });
      }

      this.logger.debug('Attempting to create winning with nested payments.');
      const createdWinning = await tx.winnings.create({
        data: winningModel,
      });

      if (!createdWinning) {
        this.logger.error('Failed to create winning!');
        result.error = {
          code: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to create winning!',
        };
        return result;
      } else {
        this.logger.debug('Successfully created winning', { createdWinning });
      }

      if (engagementConsumePlan) {
        await this.consumeEngagementBillingAccounts(engagementConsumePlan);
      }

      if (
        !isPointsAward &&
        !payrollPayment &&
        (!hasConnectedPaymentMethod || !hasActiveTaxForm)
      ) {
        setupEmailNotificationAmount = body.details.find(
          (d) => d.installmentNumber === 1,
        )?.totalAmount;
      }

      this.logger.debug('Transaction completed successfully.');
      return result;
    });

    if (!transactionResult.error && setupEmailNotificationAmount) {
      this.logger.debug(
        `Sending setup email notification for user ${body.winnerId} with amount ${setupEmailNotificationAmount}`,
      );
      void this.sendSetupEmailNotification(
        body.winnerId,
        setupEmailNotificationAmount,
      );
    }

    return transactionResult;
  }
}
