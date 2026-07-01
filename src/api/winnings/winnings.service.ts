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
import {
  TopcoderChallengeInfo,
  TopcoderChallengesService,
} from 'src/shared/topcoder/challenges.service';
import { TopcoderM2MHttpError } from 'src/shared/topcoder/topcoder-m2m.service';
import { resolveChallengeMemberPaymentAmount } from 'src/shared/payments/challenge-payment-amount.util';

const BUDGET_LEDGER_DECIMAL_PLACES = 4;
const PAYMENT_DECIMAL_PLACES = 2;
const PAYMENT_MARKUP_DECIMAL_PLACES = 4;
export const CHALLENGE_BUDGET_SYNC_SKIP_ATTRIBUTE = 'skipChallengeBudgetSync';

interface EngagementBillingAccountConsume {
  amount: number;
  billingAccountId: number;
  detailIndex: number;
}

interface EngagementBillingAccountConsumePlan {
  assignmentId: string;
  billingAccountId: number;
  challengeMarkup: number;
  consumes: EngagementBillingAccountConsume[];
}

interface ChallengeBillingAccountSync {
  billingAccountId: number;
  markup: number;
}

interface ChallengeBillingAccountSyncPlan {
  billingAccounts: ChallengeBillingAccountSync[];
  challengeId: string;
  status: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * The winning service.
 */
@Injectable()
export class WinningsService {
  private readonly logger = new Logger(WinningsService.name);

  private readonly engagementPaymentReleaseWindowDays =
    ENV_CONFIG.ENGAGEMENT_PAYMENT_RELEASE_WINDOW_DAYS;

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   * @param taxFormRepo repository for tax form checks.
   * @param paymentMethodRepo repository for member payment method checks.
   * @param originRepo repository for winning origin lookup.
   * @param tcMembersService Topcoder member profile client.
   * @param identityVerificationRepo repository for identity verification checks.
   * @param tcEmailService Topcoder email client.
   * @param topcoderChallengesService Topcoder challenge client.
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
    private readonly topcoderChallengesService: TopcoderChallengesService,
    private readonly topcoderEngagementsService: TopcoderEngagementsService,
    private readonly billingAccountsService: BillingAccountsService,
  ) {}

  /**
   * Builds the persisted winning attributes object.
   * @param attributes Arbitrary attributes supplied by the client. The internal
   * challenge budget sync skip marker is removed before persistence.
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
    delete normalizedAttributes[CHALLENGE_BUDGET_SYNC_SKIP_ATTRIBUTE];

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
   * Checks whether the winning request opts out of per-winning challenge budget
   * synchronization.
   *
   * @param body incoming winning creation request.
   * @returns True when another caller will manage the aggregate challenge
   * billing-account row.
   */
  private shouldSkipChallengeBudgetSync(
    body: WinningCreateRequestDto,
  ): boolean {
    const attributes =
      body.attributes &&
      typeof body.attributes === 'object' &&
      !Array.isArray(body.attributes)
        ? (body.attributes as Record<string, unknown>)
        : undefined;

    return attributes?.[CHALLENGE_BUDGET_SYNC_SKIP_ATTRIBUTE] === true;
  }

  /**
   * Calculates the default release date for engagement payments.
   *
   * @returns A Date offset from now by the configured engagement release
   * window.
   */
  private buildEngagementReleaseDate(): Date {
    return new Date(
      Date.now() + this.engagementPaymentReleaseWindowDays * DAY_IN_MS,
    );
  }

  /**
   * Normalizes the billing-account id from a challenge payment detail.
   *
   * @param detail payment detail supplied in the winning request.
   * @param detailIndex zero-based detail index for error reporting.
   * @returns positive integer billing account id.
   * @throws BadRequestException when the detail cannot be mapped to an id.
   */
  private normalizeChallengeBillingAccountId(
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
   * Finds the distinct billing accounts touched by USD challenge payment details.
   *
   * @param body incoming winning creation request.
   * @returns Unique positive billing-account ids from USD payment details.
   * @throws BadRequestException when a USD detail has an invalid billing account.
   */
  private getChallengePaymentBillingAccountIds(
    body: WinningCreateRequestDto,
  ): number[] {
    const billingAccountIds = new Set<number>();

    for (const [detailIndex, detail] of (body.details || []).entries()) {
      if (String(detail.currency) !== String(PrizeType.USD)) {
        continue;
      }

      billingAccountIds.add(
        this.normalizeChallengeBillingAccountId(detail, detailIndex),
      );
    }

    return [...billingAccountIds];
  }

  /**
   * Normalizes the billing-account id configured on a challenge.
   *
   * @param billingAccountId raw challenge billing-account id.
   * @param challengeId challenge id used in diagnostics.
   * @returns positive integer billing-account id, or `undefined` when the
   * challenge does not expose a configured billing account.
   * @throws InternalServerErrorException when the configured billing-account id
   * is malformed.
   */
  private normalizeConfiguredChallengeBillingAccountId(
    billingAccountId: unknown,
    challengeId: string,
  ): number | undefined {
    if (billingAccountId === undefined || billingAccountId === null) {
      return undefined;
    }

    if (
      typeof billingAccountId !== 'string' &&
      typeof billingAccountId !== 'number'
    ) {
      throw new InternalServerErrorException(
        `Challenge ${challengeId} billing account id has invalid type`,
      );
    }

    const normalizedBillingAccountId = String(billingAccountId).trim();

    if (!normalizedBillingAccountId) {
      return undefined;
    }

    if (!/^\d+$/.test(normalizedBillingAccountId)) {
      throw new InternalServerErrorException(
        `Challenge ${challengeId} billing account id is invalid`,
      );
    }

    const parsedBillingAccountId = Number(normalizedBillingAccountId);

    if (
      !Number.isSafeInteger(parsedBillingAccountId) ||
      parsedBillingAccountId <= 0
    ) {
      throw new InternalServerErrorException(
        `Challenge ${challengeId} billing account id is invalid`,
      );
    }

    return parsedBillingAccountId;
  }

  /**
   * Resolves the billing accounts that should be synchronized for a challenge
   * payment request.
   *
   * When challenge-api exposes a challenge billing account, finance treats it
   * as the source of truth and rejects caller-supplied payment details that
   * target another account. Challenges without billing metadata keep the
   * previous detail-based fallback.
   *
   * @param body incoming winning creation request.
   * @param challenge challenge-api-v6 challenge details.
   * @param detailBillingAccountIds billing-account ids supplied by USD payment
   * details.
   * @returns billing-account ids to synchronize for this challenge.
   * @throws BadRequestException when a payment detail targets a different
   * billing account than the challenge.
   * @throws InternalServerErrorException when the challenge billing account id
   * is malformed.
   */
  private getChallengeBillingAccountSyncIds(
    body: WinningCreateRequestDto,
    challenge: TopcoderChallengeInfo,
    detailBillingAccountIds: number[],
  ): number[] {
    const configuredBillingAccountId =
      this.normalizeConfiguredChallengeBillingAccountId(
        challenge.billing?.billingAccountId,
        String(challenge.id),
      );

    if (configuredBillingAccountId === undefined) {
      return detailBillingAccountIds;
    }

    for (const [detailIndex, detail] of (body.details || []).entries()) {
      if (String(detail.currency) !== String(PrizeType.USD)) {
        continue;
      }

      const suppliedBillingAccountId = this.normalizeChallengeBillingAccountId(
        detail,
        detailIndex,
      );

      if (suppliedBillingAccountId !== configuredBillingAccountId) {
        throw new BadRequestException(
          `details[${detailIndex}].billingAccount does not match the challenge billing account`,
        );
      }
    }

    return [configuredBillingAccountId];
  }

  /**
   * Resolves the markup rate to use for a challenge billing-account sync.
   *
   * @param challenge challenge-api-v6 challenge details.
   * @param billingAccountId billing account being synchronized.
   * @returns Non-negative markup rate.
   * @throws InternalServerErrorException when no valid markup can be resolved.
   */
  private async resolveChallengeBillingMarkup(
    challenge: TopcoderChallengeInfo,
    billingAccountId: number,
  ): Promise<number> {
    const candidateMarkups = [
      challenge.billing?.clientBillingRate,
      challenge.billing?.markup,
    ];

    for (const candidateMarkup of candidateMarkups) {
      const markup = Number(candidateMarkup);

      if (Number.isFinite(markup) && markup >= 0) {
        return markup;
      }
    }

    const billingAccount =
      await this.billingAccountsService.getBillingAccountById(billingAccountId);

    if (!Number.isFinite(billingAccount.markup) || billingAccount.markup < 0) {
      throw new InternalServerErrorException(
        `Billing account ${billingAccountId} has invalid markup`,
      );
    }

    return billingAccount.markup;
  }

  /**
   * Builds the challenge budget synchronization plan for a winning request.
   *
   * Finance only synchronizes non-engagement USD payment requests that point to
   * an existing challenge. Challenge-generated payment batches set an internal
   * skip marker because they already write one aggregate budget row after all
   * generated payments are attempted.
   *
   * @param body incoming winning creation request.
   * @returns Billing-account sync plan, or `undefined` when the request is not
   * a challenge payment.
   * @throws BadRequestException when a challenge payment detail has an invalid
   * billing account. When the challenge exposes a billing account, that account
   * is used as the source of truth for the sync.
   * @throws InternalServerErrorException when markup cannot be resolved.
   */
  private async buildChallengeBillingAccountSyncPlan(
    body: WinningCreateRequestDto,
  ): Promise<ChallengeBillingAccountSyncPlan | undefined> {
    const challengeId = String(body.externalId ?? '').trim();

    if (
      this.shouldSkipChallengeBudgetSync(body) ||
      body.category === WinningsCategory.ENGAGEMENT_PAYMENT ||
      body.type !== WinningsType.PAYMENT ||
      !challengeId
    ) {
      return undefined;
    }

    const billingAccountIds = this.getChallengePaymentBillingAccountIds(body);

    if (billingAccountIds.length === 0) {
      return undefined;
    }

    const challenge =
      await this.topcoderChallengesService.getChallengeById(challengeId);

    if (!challenge?.id || !challenge.status) {
      return undefined;
    }

    const billingAccountSyncIds = this.getChallengeBillingAccountSyncIds(
      body,
      challenge,
      billingAccountIds,
    );

    return {
      billingAccounts: await Promise.all(
        billingAccountSyncIds.map(async (billingAccountId) => ({
          billingAccountId,
          markup: await this.resolveChallengeBillingMarkup(
            challenge,
            billingAccountId,
          ),
        })),
      ),
      challengeId,
      status: challenge.status,
    };
  }

  /**
   * Sums non-cancelled persisted USD member-payment rows for a challenge and
   * billing account.
   *
   * @param tx active Prisma transaction.
   * @param challengeId challenge external id stored on winnings.
   * @param billingAccountId billing account stored on payment rows.
   * @returns Payment-scale member-payment amount for active challenge payments
   * on that billing account.
   */
  private async getPersistedChallengePaymentTotal(
    tx: Prisma.TransactionClient,
    challengeId: string,
    billingAccountId: number,
  ): Promise<number> {
    const payments = await tx.payment.findMany({
      select: {
        gross_amount: true,
        total_amount: true,
      },
      where: {
        billing_account: String(billingAccountId),
        currency: PrizeType.USD,
        payment_status: { not: payment_status.CANCELLED },
        winnings: {
          external_id: challengeId,
          type: winnings_type.PAYMENT,
        },
      },
    });
    const totalAmount = payments.reduce(
      (sum, paymentRow) =>
        sum.plus(
          resolveChallengeMemberPaymentAmount({
            grossAmount: paymentRow.gross_amount,
            totalAmount: paymentRow.total_amount,
          }),
        ),
      new Prisma.Decimal(0),
    );

    return this.toPaymentAmount(totalAmount);
  }

  /**
   * Synchronizes challenge payment totals into billing-account locked/consumed rows.
   *
   * @param tx active Prisma transaction after the winning row has been created.
   * @param syncPlan challenge billing-account sync plan.
   * @returns Resolves when all affected billing accounts are synchronized.
   */
  private async syncChallengeBillingAccountBudget(
    tx: Prisma.TransactionClient,
    syncPlan: ChallengeBillingAccountSyncPlan,
  ): Promise<void> {
    await Promise.all(
      syncPlan.billingAccounts.map(async ({ billingAccountId, markup }) => {
        const totalUsdAmount = await this.getPersistedChallengePaymentTotal(
          tx,
          syncPlan.challengeId,
          billingAccountId,
        );

        await this.billingAccountsService.lockConsumeAmount({
          billingAccountId,
          challengeId: syncPlan.challengeId,
          markup,
          status: syncPlan.status,
          totalPrizesInCents: totalUsdAmount * 100,
        });
      }),
    );
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
   * Quantizes a decimal value to the requested number of fractional digits.
   *
   * @param amount Decimal amount to normalize.
   * @param decimalPlaces target number of fractional digits.
   * @returns JavaScript number rounded to the requested scale.
   */
  private toScaledAmount(
    amount: Prisma.Decimal,
    decimalPlaces: number,
  ): number {
    return Number(
      amount
        .toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(decimalPlaces),
    );
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
    return this.toScaledAmount(amount, BUDGET_LEDGER_DECIMAL_PLACES);
  }

  /**
   * Quantizes a payment-column decimal value to the persisted payment scale.
   *
   * @param amount Decimal amount to normalize.
   * @returns JavaScript number rounded to the payment column's two-decimal
   * scale.
   */
  private toPaymentAmount(amount: Prisma.Decimal): number {
    return this.toScaledAmount(amount, PAYMENT_DECIMAL_PLACES);
  }

  /**
   * Quantizes a payment markup to the persisted challenge-markup scale.
   *
   * Finance stores `payment.challenge_markup` at the same four-decimal scale as
   * billing-accounts-api-v6 markup values so fee calculations do not round the
   * rate to cents before multiplication.
   *
   * @param markup Decimal markup to normalize.
   * @returns JavaScript number rounded to the challenge-markup column scale.
   */
  private toPaymentMarkup(markup: Prisma.Decimal): number {
    return this.toScaledAmount(markup, PAYMENT_MARKUP_DECIMAL_PLACES);
  }

  /**
   * Normalizes the engagement billing-account markup for payment persistence
   * while preserving billing-account precision for downstream fee math.
   *
   * @param markup billing-account markup returned by billing-accounts-api-v6.
   * @returns Four-decimal markup suitable for persistence on payment rows.
   * @throws InternalServerErrorException when the markup is not finite.
   */
  private calculateEngagementChallengeMarkup(markup: number): number {
    if (!Number.isFinite(markup)) {
      throw new InternalServerErrorException(
        'Engagement billing account has invalid markup',
      );
    }

    return this.toPaymentMarkup(new Prisma.Decimal(markup));
  }

  /**
   * Computes the persisted engagement challenge fee using the normalized
   * billing-account markup.
   *
   * @param totalAmount payment detail total amount.
   * @param challengeMarkup billing-account markup persisted on the payment row.
   * @param detailIndex zero-based detail index for error reporting.
   * @returns Payment-scale challenge fee.
   * @throws BadRequestException when the detail amount is invalid.
   * @throws InternalServerErrorException when the markup or computed value is
   * not finite.
   */
  private calculateEngagementChallengeFee(
    totalAmount: number,
    challengeMarkup: number,
    detailIndex: number,
  ): number {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw new BadRequestException(
        `details[${detailIndex}].totalAmount must be a non-negative number`,
      );
    }

    if (!Number.isFinite(challengeMarkup)) {
      throw new InternalServerErrorException(
        'Engagement billing account has invalid markup',
      );
    }

    const challengeFee = this.toPaymentAmount(
      new Prisma.Decimal(totalAmount).mul(new Prisma.Decimal(challengeMarkup)),
    );

    if (!Number.isFinite(challengeFee)) {
      throw new InternalServerErrorException(
        `Failed to compute challenge fee for details[${detailIndex}]`,
      );
    }

    return challengeFee;
  }

  /**
   * Computes an engagement consume amount with decimal-safe arithmetic.
   *
   * @param totalAmount payment detail total amount.
   * @param challengeMarkup billing-account markup persisted on the payment row.
   * @param detailIndex zero-based detail index for error reporting.
   * @returns Ledger-scale consume amount including markup.
   * @throws BadRequestException when the detail amount is invalid.
   * @throws InternalServerErrorException when the markup or computed value is
   * not finite.
   */
  private calculateEngagementConsumeAmount(
    totalAmount: number,
    challengeMarkup: number,
    detailIndex: number,
  ): number {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw new BadRequestException(
        `details[${detailIndex}].totalAmount must be a non-negative number`,
      );
    }

    if (!Number.isFinite(challengeMarkup)) {
      throw new InternalServerErrorException(
        'Engagement billing account has invalid markup',
      );
    }

    const totalAmountDecimal = new Prisma.Decimal(totalAmount);
    const markupDecimal = new Prisma.Decimal(challengeMarkup);
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
   * requests to execute for non-TopGear billing accounts, plus the normalized
   * four-decimal challenge markup persisted on the created payment rows.
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

    const challengeMarkup = this.calculateEngagementChallengeMarkup(
      billingAccount.markup,
    );

    if (this.isTopGearBillingAccount(trustedBillingAccountId)) {
      this.logger.info(
        'Ignore BA validation for Topgear account:',
        trustedBillingAccountId,
      );
      return {
        assignmentId,
        billingAccountId: trustedBillingAccountId,
        challengeMarkup,
        consumes: [],
      };
    }

    const consumes = body.details.reduce<EngagementBillingAccountConsume[]>(
      (consumePlan, detail, detailIndex) => {
        consumePlan.push({
          amount: this.calculateEngagementConsumeAmount(
            Number(detail.totalAmount),
            challengeMarkup,
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
      challengeMarkup,
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
   * Create winnings with parameters. Engagement payment requests derive
   * `payment.challenge_markup` and `payment.challenge_fee` from the trusted
   * project billing account and are gated by billing-account budget
   * consumption before the transaction can complete. Challenge payment
   * requests that point to a challenge synchronize the aggregate persisted USD
   * payment total back to billing-account locked or consumed rows based on the
   * current challenge status.
   *
   * @param body the request body
   * @param userId the request userId
   * @returns the Promise with response result
   * @throws BadRequestException when billing-account budget sync fails or
   * payment input is invalid.
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
    const challengeBillingAccountSyncPlan =
      await this.buildChallengeBillingAccountSyncPlan(body);
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
          create: [] as (Pick<
            payment,
            | 'gross_amount'
            | 'total_amount'
            | 'installment_number'
            | 'currency'
            | 'net_amount'
            | 'payment_status'
            | 'created_by'
            | 'billing_account'
            | 'challenge_markup'
            | 'challenge_fee'
          > &
            Partial<Pick<payment, 'release_date'>>)[],
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

      const engagementReleaseDate = isEngagementPayment
        ? this.buildEngagementReleaseDate()
        : undefined;
      for (const [detailIndex, detail] of (body.details || []).entries()) {
        const challengeFee = engagementConsumePlan
          ? this.calculateEngagementChallengeFee(
              Number(detail.totalAmount),
              engagementConsumePlan.challengeMarkup,
              detailIndex,
            )
          : (detail.challengeFee ?? 0);
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
          challenge_markup: engagementConsumePlan
            ? Prisma.Decimal(engagementConsumePlan.challengeMarkup)
            : null,
          challenge_fee: Prisma.Decimal(challengeFee),
          ...(engagementReleaseDate !== undefined
            ? { release_date: engagementReleaseDate }
            : {}),
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

      if (challengeBillingAccountSyncPlan) {
        await this.syncChallengeBillingAccountBudget(
          tx,
          challengeBillingAccountSyncPlan,
        );
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
