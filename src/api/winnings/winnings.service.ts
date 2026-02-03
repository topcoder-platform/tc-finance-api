import { Injectable, HttpStatus } from '@nestjs/common';
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
import { PaymentStatus } from 'src/dto/payment.dto';
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

/**
 * The winning service.
 */
@Injectable()
export class WinningsService {
  private readonly logger = new Logger(WinningsService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly originRepo: OriginRepository,
    private readonly tcMembersService: TopcoderMembersService,
    private readonly identityVerificationRepo: IdentityVerificationRepository,
    private readonly tcEmailService: TopcoderEmailService,
  ) {}

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
   * Create winnings with parameters
   * @param body the request body
   * @param userId the request userId
   * @returns the Promise with response result
   */
  async createWinningWithPayments(
    body: WinningCreateRequestDto,
    userId: string,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    this.logger.debug(
      `Creating winning with payments for user ${body.winnerId}`,
      body,
    );

    return this.prisma.$transaction(async (tx) => {
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
          body.category === winnings_category.POINTS_AWARD ||
          body.details.some((p) => p.currency === PrizeType.POINT)) &&
        (body.type !== WinningsType.POINTS ||
          body.category !== winnings_category.POINTS_AWARD ||
          !body.details.some((p) => p.currency === PrizeType.POINT))
      ) {
        const isTypePoints = body.type === WinningsType.POINTS;
        const isCategoryPoints =
          body.category === winnings_category.POINTS_AWARD;
        const hasPointsCurrency = body.details.some(
          (p) => p.currency === PrizeType.POINT,
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

      const isEngagementPayment =
        body.category === WinningsCategory.ENGAGEMENT_PAYMENT;
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
        attributes: body.attributes,
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

      const payrollPayment = (body.attributes || {})['payroll'] === true;
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
          billing_account: detail.billingAccount,
          challenge_fee: Prisma.Decimal(detail.challengeFee),
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
      } else {
        this.logger.debug('Successfully created winning', { createdWinning });
      }

      if (
        !isPointsAward &&
        !payrollPayment &&
        (!hasConnectedPaymentMethod || !hasActiveTaxForm)
      ) {
        const amount = body.details.find(
          (d) => d.installmentNumber === 1,
        )?.totalAmount;

        if (amount) {
          this.logger.debug(
            `Sending setup email notification for user ${body.winnerId} with amount ${amount}`,
          );
          void this.sendSetupEmailNotification(body.winnerId, amount);
        }
      }

      this.logger.debug('Transaction completed successfully.');
      return result;
    });
  }
}
