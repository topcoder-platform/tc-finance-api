import { Injectable, Logger } from '@nestjs/common';
import { isNumber, includes } from 'lodash';
import { ENV_CONFIG } from 'src/config';
import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { TopcoderM2MService } from './topcoder-m2m.service';

const { TOPCODER_API_V6_BASE_URL, TGBillingAccounts } = ENV_CONFIG;

interface LockAmountDTO {
  challengeId: string;
  amount: number;
}
interface ConsumeAmountDTO {
  challengeId: string;
  amount: number;
}

export interface BAValidation {
  challengeId?: string;
  billingAccountId?: number;
  markup?: number;
  prevStatus?: string;
  status?: string;
  prevTotalPrizesInCents?: number;
  totalPrizesInCents: number;
}

@Injectable()
export class BillingAccountsService {
  private readonly logger = new Logger(BillingAccountsService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  async lockAmount(billingAccountId: number, dto: LockAmountDTO) {
    this.logger.log('BA validation lock amount:', billingAccountId, dto);

    try {
      return await this.m2MService.m2mFetch(
        `${TOPCODER_API_V6_BASE_URL}/billing-accounts/${billingAccountId}/lock-amount`,
        {
          method: 'PATCH',
          body: JSON.stringify(dto),
        },
      );
    } catch (err: any) {
      this.logger.error(
        err.response?.data?.result?.content ??
          'Failed to lock challenge amount',
      );
      throw new Error(
        `Budget Error: Requested amount $${dto.amount} exceeds available budget for Billing Account #${billingAccountId}.
        Please contact the Topcoder Project Manager for further assistance.`,
      );
    }
  }

  async consumeAmount(billingAccountId: number, dto: ConsumeAmountDTO) {
    this.logger.log('BA validation consume amount:', billingAccountId, dto);

    try {
      return await this.m2MService.m2mFetch(
        `${TOPCODER_API_V6_BASE_URL}/billing-accounts/${billingAccountId}/consume-amount`,
        {
          method: 'PATCH',
          body: JSON.stringify(dto),
        },
      );
    } catch (err: any) {
      this.logger.error(
        err.response?.data?.result?.content ??
          'Failed to consume challenge amount',
        err,
      );
      throw new Error('Failed to consume challenge amount');
    }
  }

  async lockConsumeAmount(
    baValidation: BAValidation,
    rollback: boolean = false,
  ): Promise<void> {
    const billingAccountId = baValidation.billingAccountId
      ? +baValidation.billingAccountId
      : undefined;
    if (!isNumber(billingAccountId)) {
      this.logger.warn(
        "Challenge doesn't have billing account id:",
        baValidation,
      );
      return;
    }
    if (includes(TGBillingAccounts, billingAccountId)) {
      this.logger.info(
        'Ignore BA validation for Topgear account:',
        billingAccountId,
      );
      return;
    }

    this.logger.log('BA validation:', baValidation);

    const status = baValidation.status?.toLowerCase();
    if (
      status === ChallengeStatuses.Active.toLowerCase() ||
      status === ChallengeStatuses.Approved.toLowerCase()
    ) {
      // Update lock amount
      const currAmount = baValidation.totalPrizesInCents / 100;
      const prevAmount = (baValidation.prevTotalPrizesInCents ?? 0) / 100;

      await this.lockAmount(billingAccountId, {
        challengeId: baValidation.challengeId!,
        amount:
          (rollback ? prevAmount : currAmount) * (1 + baValidation.markup!),
      });
    } else if (status === ChallengeStatuses.Completed.toLowerCase()) {
      // Note an already completed challenge could still be updated with prizes
      const currAmount = baValidation.totalPrizesInCents / 100;
      const prevAmount =
        baValidation.prevStatus === ChallengeStatuses.Completed
          ? (baValidation.prevTotalPrizesInCents ?? 0) / 100
          : 0;

      if (currAmount !== prevAmount) {
        await this.consumeAmount(billingAccountId, {
          challengeId: baValidation.challengeId!,
          amount:
            (rollback ? prevAmount : currAmount) * (1 + baValidation.markup!),
        });
      }
    } else if (
      [
        ChallengeStatuses.Deleted,
        ChallengeStatuses.Canceled,
        ChallengeStatuses.CancelledFailedReview,
        ChallengeStatuses.CancelledFailedScreening,
        ChallengeStatuses.CancelledZeroSubmissions,
        ChallengeStatuses.CancelledWinnerUnresponsive,
        ChallengeStatuses.CancelledClientRequest,
        ChallengeStatuses.CancelledRequirementsInfeasible,
        ChallengeStatuses.CancelledZeroRegistrations,
        ChallengeStatuses.CancelledPaymentFailed,
      ].some((t) => t.toLowerCase() === status)
    ) {
      if (
        baValidation.prevStatus?.toLowerCase() ===
        ChallengeStatuses.Active.toLowerCase()
      ) {
        // Challenge canceled, unlock previous locked amount
        const currAmount = 0;
        const prevAmount = (baValidation.prevTotalPrizesInCents ?? 0) / 100;

        if (currAmount !== prevAmount) {
          await this.lockAmount(billingAccountId, {
            challengeId: baValidation.challengeId!,
            amount: rollback ? prevAmount : 0,
          });
        }
      }
    }
  }

  async getBillingAccountsForUser(userId: string): Promise<string[]> {
    this.logger.log(`Fetching billing accounts for user '${userId}'`);

    try {
      return await this.m2MService
        .m2mFetch<
          { tcBillingAccountId: string }[]
        >(`${TOPCODER_API_V6_BASE_URL}/billing-accounts/users/${userId}`)
        .then((r) => r.map((b) => `${b.tcBillingAccountId}`));
    } catch (err: any) {
      this.logger.error(
        err.response?.data?.result?.content ??
          `Failed to fetch billing accounts for user '${userId}'!`,
        err,
      );
      throw new Error('Failed to fetch billing acccounts!');
    }
  }
}
