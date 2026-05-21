import {
  Injectable,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  Prisma,
  payment_status,
  winnings_category,
  winnings_type,
} from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';
import { PaymentsService } from 'src/shared/payments';
import { AccessControlService } from 'src/shared/access-control/access-control.service';

import { ResponseDto } from 'src/dto/api-response.dto';
import { PaymentStatus } from 'src/dto/payment.dto';
import { PrizeType } from '../challenges/models';
import { WinningAuditDto, AuditPayoutDto } from './dto/audit.dto';
import { WinningUpdateRequestDto } from './dto/winnings.dto';
import { Logger } from 'src/shared/global';
import { BillingAccountsService } from 'src/shared/topcoder/billing-accounts.service';
import {
  TopcoderEngagementAssignment,
  TopcoderEngagementDetails,
  TopcoderEngagementsService,
} from 'src/shared/topcoder/engagements.service';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';
import {
  TopcoderChallengeInfo,
  TopcoderChallengesService,
} from 'src/shared/topcoder/challenges.service';
import { WinningPaymentDetailsDto } from './dto/payment-details.dto';
import { resolveChallengeMemberPaymentAmount } from 'src/shared/payments/challenge-payment-amount.util';

const PAYMENT_DECIMAL_PLACES = 2;
const BUDGET_LEDGER_DECIMAL_PLACES = 4;

interface ChallengeBudgetSyncTarget {
  billingAccountId: number;
  challengeId: string;
}

interface EngagementBudgetSyncTarget {
  assignmentId: string;
  billingAccountId: number;
}

/**
 * The admin winning service.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly baService: BillingAccountsService,
    private readonly accessControlService: AccessControlService,
    private readonly topcoderEngagementsService: TopcoderEngagementsService,
    private readonly tcMembersService: TopcoderMembersService,
    private readonly topcoderChallengesService: TopcoderChallengesService,
  ) {}

  async verifyUserAccessToWinning(
    winningsId: string,
    userId: string,
    roles: string[] = [],
  ): Promise<void> {
    try {
      await this.accessControlService.verifyAccess(winningsId, userId, roles);
    } catch (err) {
      throw new UnauthorizedException(err?.message ?? 'access denied');
    }
  }

  private getWinningById(winningId: string) {
    return this.prisma.winnings.findFirst({ where: { winning_id: winningId } });
  }

  private getStringAttribute(
    attributes: Prisma.JsonValue | null,
    attributeName: string,
  ): string | undefined {
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    ) {
      return undefined;
    }

    const value = (attributes as Record<string, unknown>)[attributeName];
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue || undefined;
  }

  private getNumericAttribute(
    attributes: Prisma.JsonValue | null,
    attributeName: string,
  ): number | undefined {
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    ) {
      return undefined;
    }

    const value = (attributes as Record<string, unknown>)[attributeName];
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  private getWinningAssignmentId(
    winning: Awaited<ReturnType<AdminService['getWinningById']>>,
  ): string | undefined {
    if (
      !winning?.attributes ||
      typeof winning.attributes !== 'object' ||
      Array.isArray(winning.attributes)
    ) {
      return undefined;
    }

    const assignmentId = (winning.attributes as Record<string, unknown>)
      .assignmentId;

    if (typeof assignmentId === 'string') {
      const normalizedAssignmentId = assignmentId.trim();
      return normalizedAssignmentId || undefined;
    }

    if (typeof assignmentId === 'number' && Number.isFinite(assignmentId)) {
      return String(assignmentId);
    }

    return undefined;
  }

  /**
   * Resolves the wallet-admin payment creator into a handle for display.
   *
   * @param createdBy raw `created_by` value stored on the winnings row.
   * @returns The resolved Topcoder handle, or the original identifier when the
   * handle lookup fails.
   * @throws This helper does not throw.
   */
  private async getPaymentCreatorHandle(
    createdBy: unknown,
  ): Promise<string | undefined> {
    if (typeof createdBy !== 'string') {
      return undefined;
    }

    const paymentCreatorId = createdBy.trim();
    if (!paymentCreatorId) {
      return undefined;
    }

    try {
      const handles = await this.tcMembersService.getHandlesByUserIds([
        paymentCreatorId,
      ]);

      return handles[paymentCreatorId] ?? paymentCreatorId;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve payment creator handle for winnings creator ${paymentCreatorId}`,
        error instanceof Error ? error.message : error,
      );

      return paymentCreatorId;
    }
  }

  /**
   * Finds the engagement assignment that best matches the current winning.
   *
   * @param assignments assignments returned by the engagements API.
   * @param winnerId Topcoder member identifier stored on the winning.
   * @param assignmentId optional assignment identifier captured on the winning.
   * @returns the matched assignment, or the only assignment when the engagement
   * has a single assignee.
   * @throws This helper does not throw.
   */
  private findMatchingEngagementAssignment(
    assignments: TopcoderEngagementAssignment[] | null | undefined,
    winnerId: string,
    assignmentId?: string,
  ): TopcoderEngagementAssignment | undefined {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return undefined;
    }

    if (assignmentId) {
      const assignmentMatch = assignments.find((item) => {
        if (item.id === undefined || item.id === null) {
          return false;
        }

        return String(item.id).trim() === assignmentId;
      });

      if (assignmentMatch) {
        return assignmentMatch;
      }
    }

    const winnerMatch = assignments.find((item) => {
      if (item.memberId === undefined || item.memberId === null) {
        return false;
      }

      return String(item.memberId).trim() === winnerId;
    });

    if (winnerMatch) {
      return winnerMatch;
    }

    return assignments.length === 1 ? assignments[0] : undefined;
  }

  /**
   * Builds wallet-admin engagement details from an engagement record.
   *
   * @param engagement engagement payload returned by the engagements API.
   * @param assignment matched assignment for the winning, when available.
   * @param assignmentId optional assignment identifier captured on the winning.
   * @returns engagement details shaped for the payment details response.
   * @throws This helper does not throw.
   */
  private buildEngagementDetailsFromEngagement(
    engagement: TopcoderEngagementDetails,
    assignment?: TopcoderEngagementAssignment,
    assignmentId?: string,
  ): WinningPaymentDetailsDto['engagementDetails'] {
    const durationMonths =
      assignment?.durationMonths !== undefined &&
      assignment.durationMonths !== null
        ? Number(assignment.durationMonths)
        : undefined;
    const standardHoursPerWeek =
      assignment?.standardHoursPerWeek !== undefined &&
      assignment.standardHoursPerWeek !== null
        ? Number(assignment.standardHoursPerWeek)
        : undefined;
    const projectId = engagement.projectId ?? engagement.project?.id;
    const projectName =
      (engagement.projectName ?? engagement.project?.name)?.trim() ?? undefined;
    const engagementId =
      engagement.id !== undefined && engagement.id !== null
        ? String(engagement.id).trim() || undefined
        : undefined;

    return {
      assignmentId:
        assignment?.id !== undefined && assignment.id !== null
          ? String(assignment.id).trim() || assignmentId
          : assignmentId,
      engagementId,
      projectId:
        projectId !== undefined && projectId !== null
          ? String(projectId).trim() || undefined
          : undefined,
      projectName,
      engagementTitle: engagement.title?.trim() ?? undefined,
      billingStartDate: assignment?.startDate
        ? new Date(assignment.startDate)
        : undefined,
      durationMonths: Number.isFinite(durationMonths)
        ? durationMonths
        : undefined,
      ratePerHour: assignment?.ratePerHour?.trim() ?? undefined,
      standardHoursPerWeek: Number.isFinite(standardHoursPerWeek)
        ? standardHoursPerWeek
        : undefined,
      otherRemarks: assignment?.otherRemarks?.trim() ?? undefined,
    };
  }

  private getPaymentsByWinningsId(winningsId: string, paymentId?: string) {
    return this.prisma.payment.findMany({
      where: {
        winnings_id: {
          equals: winningsId,
        },
        payment_id: paymentId
          ? {
              equals: paymentId,
            }
          : undefined,
      },
      include: {
        winnings: true,
      },
    });
  }

  /**
   * Normalizes billing-account identifiers read from persisted payment or
   * challenge records.
   *
   * @param billingAccountId raw billing-account id value.
   * @returns positive integer billing-account id, or `undefined` when the value
   * is missing or malformed.
   * @throws This helper does not throw.
   */
  private normalizeBillingAccountId(
    billingAccountId: unknown,
  ): number | undefined {
    if (billingAccountId === undefined || billingAccountId === null) {
      return undefined;
    }

    if (
      typeof billingAccountId !== 'string' &&
      typeof billingAccountId !== 'number'
    ) {
      return undefined;
    }

    const normalizedBillingAccountId = String(billingAccountId).trim();
    const parsedBillingAccountId = Number(normalizedBillingAccountId);

    if (
      !normalizedBillingAccountId ||
      !/^\d+$/.test(normalizedBillingAccountId) ||
      !Number.isSafeInteger(parsedBillingAccountId) ||
      parsedBillingAccountId <= 0
    ) {
      return undefined;
    }

    return parsedBillingAccountId;
  }

  /**
   * Finds challenge billing-account rows that need to be recalculated after a
   * wallet-admin payment status or amount change.
   *
   * @param payments payment rows selected by the update request.
   * @returns unique challenge and billing-account pairs touched by USD
   * challenge payments.
   * @throws This helper does not throw.
   */
  private getChallengeBudgetSyncTargets(
    payments: Awaited<ReturnType<AdminService['getPaymentsByWinningsId']>>,
  ): ChallengeBudgetSyncTarget[] {
    const targets = new Map<string, ChallengeBudgetSyncTarget>();

    payments.forEach((payment) => {
      const challengeId =
        typeof payment.winnings.external_id === 'string'
          ? payment.winnings.external_id.trim()
          : '';

      if (
        !challengeId ||
        payment.winnings.type !== winnings_type.PAYMENT ||
        payment.winnings.category === winnings_category.ENGAGEMENT_PAYMENT ||
        (payment.currency ?? '') !== 'USD'
      ) {
        return;
      }

      const billingAccountId = this.normalizeBillingAccountId(
        payment.billing_account,
      );

      if (!billingAccountId) {
        this.logger.warn(
          `Skipping challenge budget sync for payment ${payment.payment_id}; invalid billing account ${String(payment.billing_account)}`,
        );
        return;
      }

      targets.set(`${challengeId}:${billingAccountId}`, {
        billingAccountId,
        challengeId,
      });
    });

    return [...targets.values()];
  }

  /**
   * Finds engagement billing-account rows that need to be reconciled after a
   * wallet-admin payment status or amount change.
   *
   * @param payments payment rows selected by the update request.
   * @returns unique engagement assignment and billing-account pairs touched by
   * USD engagement payments.
   * @throws This helper does not throw.
   */
  private getEngagementBudgetSyncTargets(
    payments: Awaited<ReturnType<AdminService['getPaymentsByWinningsId']>>,
  ): EngagementBudgetSyncTarget[] {
    const targets = new Map<string, EngagementBudgetSyncTarget>();

    payments.forEach((payment) => {
      const assignmentId =
        typeof payment.winnings.external_id === 'string'
          ? payment.winnings.external_id.trim()
          : '';

      if (
        !assignmentId ||
        payment.winnings.type !== winnings_type.PAYMENT ||
        payment.winnings.category !== winnings_category.ENGAGEMENT_PAYMENT ||
        (payment.currency ?? '') !== 'USD'
      ) {
        return;
      }

      const billingAccountId = this.normalizeBillingAccountId(
        payment.billing_account,
      );

      if (!billingAccountId) {
        this.logger.warn(
          `Skipping engagement budget sync for payment ${payment.payment_id}; invalid billing account ${String(payment.billing_account)}`,
        );
        return;
      }

      targets.set(`${assignmentId}:${billingAccountId}`, {
        assignmentId,
        billingAccountId,
      });
    });

    return [...targets.values()];
  }

  /**
   * Resolves the billing account to synchronize for a challenge.
   *
   * @param challenge challenge-api-v6 payload.
   * @param fallbackBillingAccountId billing account from the payment row when
   * challenge metadata does not expose one.
   * @returns the configured challenge billing account when available, otherwise
   * the payment-row billing account.
   * @throws This helper does not throw.
   */
  private resolveChallengeBudgetBillingAccountId(
    challenge: TopcoderChallengeInfo,
    fallbackBillingAccountId: number,
  ): number {
    return (
      this.normalizeBillingAccountId(challenge.billing?.billingAccountId) ??
      fallbackBillingAccountId
    );
  }

  /**
   * Resolves the markup used when writing a challenge budget line item.
   *
   * @param challenge challenge-api-v6 payload.
   * @param billingAccountId billing account being synchronized.
   * @returns non-negative markup rate.
   * @throws Error when no valid markup can be resolved.
   */
  private async resolveChallengeBudgetMarkup(
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
      await this.baService.getBillingAccountById(billingAccountId);

    if (!Number.isFinite(billingAccount.markup) || billingAccount.markup < 0) {
      throw new Error(`Billing account ${billingAccountId} has invalid markup`);
    }

    return billingAccount.markup;
  }

  /**
   * Quantizes a payment total to the same two-decimal scale used by persisted
   * payment rows.
   *
   * @param amount decimal amount to normalize.
   * @returns JavaScript number rounded to two decimal places.
   * @throws This helper does not throw.
   */
  private toPaymentAmount(amount: Prisma.Decimal): number {
    return Number(
      amount
        .toDecimalPlaces(PAYMENT_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(PAYMENT_DECIMAL_PLACES),
    );
  }

  /**
   * Quantizes a billing-account ledger amount to the same four-decimal scale
   * used by billing-accounts-api-v6.
   *
   * @param amount decimal amount to normalize.
   * @returns JavaScript number rounded to four decimal places.
   * @throws This helper does not throw.
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
   * Recomputes the persisted engagement billing fee after an admin amount edit.
   *
   * Engagement consumed rows store payment total plus `payment.challenge_fee`.
   * When wallet admin adjusts the payment total, the fee must be recalculated
   * from the persisted markup before finance resyncs the BA consumed row.
   *
   * @param category winning category for the payment being edited.
   * @param challengeMarkup markup persisted on the payment row.
   * @param totalAmount new payment total amount.
   * @returns recalculated fee for engagement payments, or `undefined` when the
   * payment is not an engagement payment or has no valid persisted markup.
   * @throws This helper does not throw.
   */
  private calculateAdjustedChallengeFee(
    category: winnings_category | null,
    challengeMarkup: Prisma.Decimal | number | string | null,
    totalAmount: number,
  ): number | undefined {
    if (category !== winnings_category.ENGAGEMENT_PAYMENT) {
      return undefined;
    }

    const markup = Number(challengeMarkup);
    if (!Number.isFinite(markup) || markup < 0) {
      return undefined;
    }

    return this.toPaymentAmount(
      new Prisma.Decimal(totalAmount).mul(new Prisma.Decimal(markup)),
    );
  }

  /**
   * Sums non-cancelled USD member-payment rows for a challenge and billing
   * account.
   *
   * @param challengeId challenge external id stored on winnings.
   * @param billingAccountId billing account stored on payment rows.
   * @returns Total member-payment amount that should remain locked or consumed
   * for the challenge billing-account line item. `gross_amount` is used before
   * `total_amount` so fee-inclusive totals are not marked up again.
   * @throws Prisma errors when the aggregate query fails.
   */
  private async getActiveChallengePaymentTotal(
    challengeId: string,
    billingAccountId: number,
  ): Promise<number> {
    const payments = await this.prisma.payment.findMany({
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
          type: 'PAYMENT',
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
   * Rewrites challenge billing-account budget rows after a wallet-admin update
   * changes the active payment total.
   *
   * @param targets unique challenge and billing-account pairs to synchronize.
   * @returns promise resolved after every target has been sent to BA.
   * @throws Error when BA synchronization fails.
   */
  private async syncChallengeBudgetTargets(
    targets: ChallengeBudgetSyncTarget[],
  ): Promise<void> {
    await Promise.all(
      targets.map(async (target) => {
        const challenge = await this.topcoderChallengesService.getChallengeById(
          target.challengeId,
        );

        if (!challenge?.id || !challenge.status) {
          this.logger.warn(
            `Skipping challenge budget sync for ${target.challengeId}; challenge metadata is unavailable`,
          );
          return;
        }

        const billingAccountId = this.resolveChallengeBudgetBillingAccountId(
          challenge,
          target.billingAccountId,
        );
        const markup = await this.resolveChallengeBudgetMarkup(
          challenge,
          billingAccountId,
        );
        const totalUsdAmount = await this.getActiveChallengePaymentTotal(
          target.challengeId,
          billingAccountId,
        );

        await this.baService.lockConsumeAmount({
          billingAccountId,
          challengeId: target.challengeId,
          markup,
          status: challenge.status,
          totalPrizesInCents: totalUsdAmount * 100,
        });
      }),
    );
  }

  /**
   * Reads active engagement payment ledger amounts for one assignment.
   *
   * @param assignmentId engagement assignment external id stored on winnings.
   * @param billingAccountId billing account stored on payment rows.
   * @returns ledger-scale consumed amounts for non-cancelled finance payments,
   * in the same order used when engagement consumed rows were created.
   * @throws Prisma errors when the payment query fails.
   */
  private async getActiveEngagementConsumeAmounts(
    assignmentId: string,
    billingAccountId: number,
  ): Promise<number[]> {
    const payments = await this.prisma.payment.findMany({
      select: {
        challenge_fee: true,
        total_amount: true,
      },
      where: {
        billing_account: String(billingAccountId),
        currency: PrizeType.USD,
        payment_status: { not: payment_status.CANCELLED },
        winnings: {
          category: winnings_category.ENGAGEMENT_PAYMENT,
          external_id: assignmentId,
          type: winnings_type.PAYMENT,
        },
      },
      orderBy: [{ created_at: 'asc' }, { payment_id: 'asc' }],
    });

    return payments.map((paymentRow) =>
      this.toBillingLedgerAmount(
        new Prisma.Decimal(paymentRow.total_amount ?? 0).plus(
          new Prisma.Decimal(paymentRow.challenge_fee ?? 0),
        ),
      ),
    );
  }

  /**
   * Reconciles engagement billing-account consumed rows after a wallet-admin
   * update changes the active payment amounts or active payment set.
   *
   * @param targets unique engagement assignment and billing-account pairs to
   * synchronize.
   * @returns promise resolved after every target has been reconciled in BA.
   * @throws Error when BA synchronization fails.
   */
  private async syncEngagementBudgetTargets(
    targets: EngagementBudgetSyncTarget[],
  ): Promise<void> {
    await Promise.all(
      targets.map(async (target) => {
        const amounts = await this.getActiveEngagementConsumeAmounts(
          target.assignmentId,
          target.billingAccountId,
        );

        await this.baService.syncEngagementConsumeAmounts({
          amounts,
          billingAccountId: target.billingAccountId,
          externalId: target.assignmentId,
        });
      }),
    );
  }

  /**
   * Verify that a BA admin user has access to the billing account(s)
   * associated with the given winningsId. Throws BadRequestException when
   * access is not allowed.
   */
  async verifyBaAdminAccessToWinning(
    winningsId: string,
    userId: string,
  ): Promise<void> {
    const payments = await this.prisma.payment.findMany({
      where: {
        winnings_id: {
          equals: winningsId,
        },
      },
      select: {
        billing_account: true,
      },
    });

    if (!payments || payments.length === 0) {
      // nothing to check
      return;
    }

    const allowedBAs = await this.baService.getBillingAccountsForUser(userId);
    const paymentBAs = payments
      .map((p) => p.billing_account)
      .filter((b) => b !== null && b !== undefined);

    const unauthorized = paymentBAs.some((ba) => !allowedBAs.includes(`${ba}`));
    if (unauthorized) {
      this.logger.warn(
        `BA admin ${userId} attempted to access winnings ${winningsId} for unauthorized billing account(s)`,
      );
      throw new BadRequestException(
        'BA admin user does not have access to the billing account for this winnings',
      );
    }
  }

  /**
   * Update winnings with parameters
   * @param body the request body
   * @param userId the request user id
   * @returns the Promise with response result
   */
  async updateWinnings(
    body: WinningUpdateRequestDto,
    userId: string,
    roles: string[] = [],
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    let needsReconciliation = false;
    const winningsId = body.winningsId;
    this.logger.log(
      `updateWinnings called by ${userId} for winningsId=${winningsId}`,
    );
    this.logger.log(`updateWinnings payload: ${JSON.stringify(body)}`);

    await this.verifyUserAccessToWinning(body.winningsId, userId, roles);

    try {
      const payments = await this.getPaymentsByWinningsId(
        winningsId,
        body.paymentId,
      );

      this.logger.log(
        `Found ${payments.length} payment(s) for winningsId=${winningsId}`,
      );
      if (payments.length === 0) {
        this.logger.warn(
          `No payments found for winningsId=${winningsId}, paymentId=${body.paymentId}`,
        );
        throw new NotFoundException('failed to get current payments');
      }

      let releaseDate;
      if (body.paymentStatus) {
        releaseDate = await this.getPaymentReleaseDateByWinningsId(winningsId);
        this.logger.log(
          `Payment release date for winningsId=${winningsId}: ${releaseDate}`,
        );
      }

      const transactions: ((
        tx: Prisma.TransactionClient,
      ) => Promise<unknown>)[] = [];
      const now = new Date().getTime();
      const shouldSyncBudget =
        body.paymentStatus === PaymentStatus.CANCELLED ||
        body.paymentAmount !== undefined;
      const challengeBudgetSyncTargets = shouldSyncBudget
        ? this.getChallengeBudgetSyncTargets(payments)
        : [];
      const engagementBudgetSyncTargets = shouldSyncBudget
        ? this.getEngagementBudgetSyncTargets(payments)
        : [];

      // iterate payments and build transaction list
      payments.forEach((payment) => {
        this.logger.log(
          `Processing payment ${payment.payment_id} (installment ${payment.installment_number}) with current status=${payment.payment_status}`,
        );

        if (payment.payment_status && payment.payment_status === 'CANCELLED') {
          this.logger.warn(
            `Attempt to update cancelled payment ${payment.payment_id} — rejecting`,
          );
          throw new BadRequestException('cannot update cancelled winnings');
        }

        let version = payment.version ?? 1;
        const queuedActions: string[] = [];

        if (body.description) {
          transactions.push((tx) =>
            tx.payment.update({
              where: {
                payment_id: payment.payment_id,
                version: version,
              },
              data: {
                winnings: {
                  update: {
                    data: {
                      description: body.description,
                    },
                  },
                },
                updated_at: new Date(),
                updated_by: userId,
                version,
              },
            }),
          );
          queuedActions.push(
            `update description -> "${body.description}" (version ${version})`,
          );

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified payment description from "${payment.winnings.description}" to "${body.description}"`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for description change');
          }
        }

        let paymentStatus = payment.payment_status as PaymentStatus;
        // Update Payment Status if requested
        if (body.paymentStatus) {
          let errMessage = '';
          switch (body.paymentStatus) {
            case PaymentStatus.ON_HOLD_ADMIN:
              errMessage = 'cannot put a processing payment on hold';
              break;
            case PaymentStatus.CANCELLED:
              errMessage = 'cannot cancel processing payment';
              break;
            case PaymentStatus.OWED:
              if (releaseDate) {
                const sinceRelease =
                  (now - releaseDate.getTime()) / (3600 * 1000);
                if (sinceRelease < 12) {
                  errMessage = `Cannot put a processing payment back to owed, unless it's been processing for at least 12 hours.  Currently it's only been ${sinceRelease.toFixed(1)} hours`;
                } else {
                  transactions.push((tx) =>
                    this.markPaymentReleaseAsFailedByWinningsId(winningsId, tx),
                  );
                }
              } else {
                errMessage = 'cannot put a processing payment back to owed';
                if (
                  payment.payment_status !== PaymentStatus.ON_HOLD_ADMIN &&
                  payment.payment_status !== PaymentStatus.PAID
                ) {
                  this.logger.warn(
                    `Invalid attempt to set OWED for payment ${payment.payment_id} when not on hold admin or paid`,
                  );
                  throw new BadRequestException(
                    "cannot put a payment back to owed unless it is on hold by an admin, or it's been paid",
                  );
                }
              }

              break;

            default:
              this.logger.warn(
                `Invalid payment status provided: ${body.paymentStatus}`,
              );
              throw new BadRequestException('invalid payment status provided');
          }

          if (
            errMessage &&
            payment.payment_status === PaymentStatus.PROCESSING
          ) {
            this.logger.warn(
              `Rejected status change for ${payment.payment_id}: ${errMessage}`,
            );
            throw new BadRequestException(errMessage);
          }

          transactions.push((tx) =>
            this.updatePaymentStatus(
              userId,
              winningsId,
              payment.payment_id,
              payment.payment_status,
              body.paymentStatus,
              version++,
              tx,
            ),
          );
          queuedActions.push(
            `update status ${payment.payment_status} -> ${body.paymentStatus}`,
          );

          paymentStatus = body.paymentStatus as PaymentStatus;

          if (body.paymentStatus === PaymentStatus.OWED) {
            needsReconciliation = true;
            this.logger.log(
              `Payment ${payment.payment_id} marked OWED; will trigger reconciliation later`,
            );
          }

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified payment status from ${payment.payment_status} to ${body.paymentStatus}`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for status change');
          }
        }

        // Update Release Date if requested
        if (body.releaseDate) {
          const newReleaseDate = new Date(body.releaseDate);

          if (
            ![
              PaymentStatus.OWED,
              PaymentStatus.ON_HOLD,
              PaymentStatus.ON_HOLD_ADMIN,
            ].includes(paymentStatus)
          ) {
            this.logger.warn(
              `Cannot update release date for payment ${payment.payment_id} in status ${paymentStatus}`,
            );
            throw new BadRequestException(
              `Cannot update release date for payment unless it's in one of the states: ${[
                PaymentStatus.OWED,
                PaymentStatus.ON_HOLD,
                PaymentStatus.ON_HOLD_ADMIN,
              ].join(', ')}`,
            );
          }

          transactions.push((tx) =>
            this.updateReleaseDate(
              userId,
              winningsId,
              payment.payment_id,
              newReleaseDate,
              version++,
              tx,
            ),
          );
          queuedActions.push(
            `update release_date ${payment.release_date?.toISOString()} -> ${newReleaseDate.toISOString()}`,
          );

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified release date from ${payment.release_date?.toISOString()} to ${newReleaseDate.toISOString()}`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for release date change');
          }
        }

        // Update payment amount if requested
        if (
          body.paymentAmount !== undefined &&
          (payment.payment_status === PaymentStatus.CREDITED ||
            payment.payment_status === PaymentStatus.OWED ||
            payment.payment_status === PaymentStatus.ON_HOLD ||
            payment.payment_status === PaymentStatus.ON_HOLD_ADMIN)
        ) {
          // ideally we should be maintaining the original split of the payment amount between installments - but we aren't really using splits anymore
          if (payment.installment_number === 1) {
            const challengeFee = this.calculateAdjustedChallengeFee(
              payment.winnings.category,
              payment.challenge_markup,
              body.paymentAmount,
            );

            transactions.push((tx) =>
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                body.paymentAmount,
                body.paymentAmount,
                body.paymentAmount,
                challengeFee,
                version,
                tx,
              ),
            );

            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Modified payment amount from ${payment.total_amount} to ${body.paymentAmount.toFixed(2)}`,
                body.auditNote,
                tx,
              ),
            );

            queuedActions.push(
              `update amounts -> ${body.paymentAmount.toFixed(2)} (installment 1)`,
            );
          } else {
            const challengeFee = this.calculateAdjustedChallengeFee(
              payment.winnings.category,
              payment.challenge_markup,
              body.paymentAmount,
            );

            transactions.push((tx) =>
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                0,
                0,
                body.paymentAmount,
                challengeFee,
                version,
                tx,
              ),
            );
            queuedActions.push(
              `update amounts -> total ${body.paymentAmount.toFixed(2)} (installment ${payment.installment_number})`,
            );
          }
        }

        this.logger.log(
          `Queued ${queuedActions.length} action(s) for payment ${payment.payment_id}: ${queuedActions.join(
            ' ; ',
          )}`,
        );
      });

      this.logger.log(
        `Executing ${transactions.length} transaction step(s) for winningsId=${winningsId}`,
      );

      // Run all transaction tasks in a single prisma transaction
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < transactions.length; i++) {
          this.logger.log(
            `Executing transaction ${i + 1}/${transactions.length}`,
          );
          await transactions[i](tx);
        }
      });

      this.logger.log(
        `Successfully executed transactions for winningsId=${winningsId}`,
      );

      if (challengeBudgetSyncTargets.length > 0) {
        await this.syncChallengeBudgetTargets(challengeBudgetSyncTargets);
      }

      if (engagementBudgetSyncTargets.length > 0) {
        await this.syncEngagementBudgetTargets(engagementBudgetSyncTargets);
      }

      if (needsReconciliation) {
        const winning = await this.prisma.winnings.findFirst({
          select: {
            winner_id: true,
          },
          where: {
            winning_id: winningsId,
          },
        });

        if (winning?.winner_id) {
          this.logger.log(
            `Triggering payments reconciliation for user ${winning.winner_id}`,
          );
          await this.paymentsService.reconcileUserPayments(winning.winner_id);
          this.logger.log(
            `Reconciliation triggered for user ${winning.winner_id}`,
          );
        } else {
          this.logger.warn(
            `Needs reconciliation but no winner_id found for winningsId=${winningsId}`,
          );
        }
      }

      result.data = 'Successfully updated winnings';
      this.logger.log(
        `updateWinnings completed for winningsId=${winningsId}: ${result.data}`,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        this.logger.warn(
          `updateWinnings validation error for winningsId=${winningsId}: ${error.message}`,
        );
        throw error;
      }
      this.logger.error('Updating winnings failed', error);
      const message = 'Updating winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }

  private async buildTaskDetails(
    winningsId: string,
    externalId: string | undefined,
  ): Promise<WinningPaymentDetailsDto['taskDetails']> {
    const taskDetails: WinningPaymentDetailsDto['taskDetails'] = {};

    if (externalId) {
      try {
        const challenge =
          await this.topcoderChallengesService.getChallengeById(externalId);
        if (challenge?.createdBy) {
          taskDetails.paymentCreatorHandle = await this.getPaymentCreatorHandle(
            challenge.createdBy,
          );
        }
        if (challenge?.projectId) {
          taskDetails.projectId = String(challenge.projectId);
          try {
            const project = await this.topcoderChallengesService.getProjectById(
              challenge.projectId,
            );
            if (project?.name) {
              taskDetails.projectName = project.name;
            }
          } catch {
            // project name is optional — ignore failures
          }
        }
      } catch {
        // projectId is optional — ignore failures
      }
    }

    try {
      const audits = await this.prisma.audit.findMany({
        where: { winnings_id: winningsId },
        orderBy: { created_at: 'desc' },
        take: 200,
      });
      const approverAudit = audits.find(
        (a) =>
          typeof a.action === 'string' &&
          a.action.includes('ON_HOLD_ADMIN') &&
          a.action.includes('OWED') &&
          a.action.indexOf('ON_HOLD_ADMIN') < a.action.indexOf('OWED'),
      );
      if (approverAudit?.user_id) {
        const userId = String(approverAudit.user_id);
        const handle = await this.getPaymentCreatorHandle(userId);
        taskDetails.paymentApproverHandle = handle ?? undefined;
      }
    } catch {
      // approver is optional — ignore failures
    }

    return taskDetails;
  }

  async getWinningPaymentDetails(
    winningsId: string,
    userId: string,
    roles: string[] = [],
  ): Promise<ResponseDto<WinningPaymentDetailsDto>> {
    const result = new ResponseDto<WinningPaymentDetailsDto>();

    await this.verifyUserAccessToWinning(winningsId, userId, roles);

    const winning = await this.getWinningById(winningsId);
    if (!winning) {
      throw new NotFoundException('Winning not found');
    }

    const workLog = {
      hoursWorked: this.getNumericAttribute(winning.attributes, 'hoursWorked'),
      remarks: this.getStringAttribute(winning.attributes, 'remarks'),
    };
    const paymentCreatorHandle = await this.getPaymentCreatorHandle(
      winning.created_by,
    );

    result.data = {
      paymentCreatorHandle,
      workLog,
    };

    const assignmentId = this.getWinningAssignmentId(winning);
    const externalId =
      typeof winning.external_id === 'string'
        ? winning.external_id.trim() || undefined
        : undefined;
    const assignmentLookupId = assignmentId ?? externalId;
    const isEngagementPayment = winning.category === 'ENGAGEMENT_PAYMENT';

    const isTaskPayment = winning.category === 'TASK_PAYMENT';

    if (isTaskPayment) {
      result.data.taskDetails = await this.buildTaskDetails(
        winningsId,
        externalId,
      );
      return result;
    }

    if (!isEngagementPayment) {
      return result;
    }

    if (assignmentLookupId) {
      try {
        const assignmentContext =
          await this.topcoderEngagementsService.getAssignmentContextById(
            assignmentLookupId,
          );

        result.data.engagementDetails = {
          assignmentId: assignmentContext.assignmentId,
          engagementId: assignmentContext.engagementId,
          projectId: assignmentContext.projectId,
          projectName: assignmentContext.projectName ?? undefined,
          engagementTitle: assignmentContext.engagementTitle,
          billingStartDate: assignmentContext.startDate
            ? new Date(assignmentContext.startDate)
            : undefined,
          durationMonths: assignmentContext.durationMonths ?? undefined,
          ratePerHour: assignmentContext.ratePerHour ?? undefined,
          standardHoursPerWeek:
            assignmentContext.standardHoursPerWeek ?? undefined,
          otherRemarks: assignmentContext.otherRemarks ?? undefined,
        };

        return result;
      } catch (error) {
        this.logger.warn(
          `Failed to enrich winning ${winningsId} with assignment context`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (!externalId) {
      return result;
    }

    try {
      const engagement =
        await this.topcoderEngagementsService.getEngagementById(externalId);
      const assignment = this.findMatchingEngagementAssignment(
        engagement.assignments,
        winning.winner_id,
        assignmentId,
      );

      result.data.engagementDetails = this.buildEngagementDetailsFromEngagement(
        engagement,
        assignment,
        assignmentId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enrich winning ${winningsId} with engagement details`,
        error instanceof Error ? error.message : error,
      );
    }

    return result;
  }

  private async getPaymentReleaseDateByWinningsId(
    winningsId: string,
  ): Promise<Date | null | undefined> {
    const paymentReleases = await this.prisma.payment_releases.findFirst({
      where: {
        payment_release_associations: {
          some: {
            payment: {
              winnings_id: {
                equals: winningsId,
              },
            },
          },
        },
      },
      include: {
        payment_release_associations: {
          include: {
            payment: true,
          },
        },
      },
    });

    return paymentReleases?.release_date;
  }

  private markPaymentReleaseAsFailedByWinningsId(
    winningsId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment_releases.updateMany({
      where: {
        payment_release_associations: {
          some: {
            payment: {
              winnings_id: {
                equals: winningsId,
              },
            },
          },
        },
      },
      data: {
        status: 'FAILED',
      },
    });
  }

  private updatePaymentStatus(
    userId: string,
    winningsId: string,
    paymentId: string,
    oldPaymentStatus: string | null,
    newPaymentStatus: PaymentStatus,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    let setDatePaidNull = false;
    if (
      [
        PaymentStatus.PAID,
        PaymentStatus.PROCESSING,
        PaymentStatus.RETURNED,
        PaymentStatus.FAILED,
      ].includes(oldPaymentStatus as PaymentStatus) &&
      newPaymentStatus === PaymentStatus.OWED
    ) {
      setDatePaidNull = true;
    }

    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
      },
      data: {
        payment_status: newPaymentStatus,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
        date_paid: setDatePaidNull ? null : undefined,
      },
    });
  }

  private addAudit(
    userId: string,
    winningsId: string,
    action: string,
    auditNote?: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).audit.create({
      data: {
        user_id: userId,
        winnings_id: winningsId,
        action,
        note: auditNote,
      },
    });
  }

  private updateReleaseDate(
    userId: string,
    winningsId: string,
    paymentId: string,
    newReleaseDate: Date,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
        payment_status: {
          in: [
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
          ],
        },
      },
      data: {
        release_date: newReleaseDate,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
      },
    });
  }

  private updatePaymentAmount(
    userId: string,
    winningsId: string,
    paymentId: string,
    netAmount: number,
    grossAmount: number,
    totalAmount: number,
    challengeFee: number | undefined,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
        payment_status: {
          in: [
            PaymentStatus.CREDITED,
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
            PaymentStatus.PAID,
            PaymentStatus.PROCESSING,
          ],
        },
      },
      data: {
        net_amount: netAmount,
        gross_amount: grossAmount,
        total_amount: totalAmount,
        challenge_fee: challengeFee,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
      },
    });
  }

  /**
   * Get winning audit for winningId
   * @param winningId the winningId
   * @returns the Promise with response result
   */
  async getWinningAudit(
    winningId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ResponseDto<WinningAuditDto[]>> {
    const result = new ResponseDto<WinningAuditDto[]>();

    try {
      const audits = await (tx ?? this.prisma).audit.findMany({
        where: {
          winnings_id: {
            equals: winningId,
          },
        },
        take: 1000,
        orderBy: { created_at: 'desc' },
      });

      result.data = audits.map((item) => ({
        id: item.id,
        winningsId: item.winnings_id,
        userId: item.user_id,
        action: item.action,
        note: item.note,
        createdAt: item.created_at,
      }));
    } catch (error) {
      this.logger.error('Getting winnings audit failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }

  /**
   * Get winning audit for winningId
   * @param winningId the winningId
   * @returns the Promise with response result
   */
  async getWinningAuditPayout(
    winningId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ResponseDto<AuditPayoutDto[]>> {
    const result = new ResponseDto<AuditPayoutDto[]>();

    try {
      const paymentReleases = await (
        tx ?? this.prisma
      ).payment_releases.findMany({
        where: {
          payment_release_associations: {
            some: {
              payment: {
                winnings_id: {
                  equals: winningId,
                },
              },
            },
          },
        },
        include: {
          payment_release_associations: {
            include: {
              payment: true,
            },
          },
          payment_method: true,
        },
        orderBy: [
          {
            created_at: 'desc',
          },
        ],
      });

      result.data = paymentReleases.map((item) => ({
        externalTransactionId: item.external_transaction_id ?? '',
        status: item.status ?? '',
        totalNetAmount: item.total_net_amount.toNumber(),
        createdAt: item.created_at!,
        metadata: JSON.stringify(item.metadata),
        paymentMethodUsed: item.payment_method.name,
        externalTransactionDetails: {},
      }));
    } catch (error) {
      this.logger.error('Getting winnings audit failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }
}
