import {
  includes,
  isEmpty,
  find,
  camelCase,
  groupBy,
  orderBy,
  uniqBy,
} from 'lodash';
import { ConflictException, Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';
import {
  Challenge,
  ChallengeResource,
  ChallengeReview,
  ResourceRole,
} from './models';
import { BillingAccountsService } from 'src/shared/topcoder/billing-accounts.service';
import { TopcoderM2MService } from 'src/shared/topcoder/topcoder-m2m.service';
import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { WinningsService } from '../winnings/winnings.service';
import {
  WinningRequestDto,
  WinningsCategory,
  WinningsType,
} from 'src/dto/winning.dto';
import { WinningsRepository } from '../repository/winnings.repo';
import { PrismaService } from 'src/shared/global/prisma.service';

interface PaymentPayload {
  handle: string;
  amount: number;
  userId: string;
  type: WinningsCategory;
  description?: string;
}

const placeToOrdinal = (place: number) => {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';

  return `${place}th`;
};

const { TOPCODER_API_V6_BASE_URL: TC_API_BASE, TGBillingAccounts } = ENV_CONFIG;

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly m2MService: TopcoderM2MService,
    private readonly baService: BillingAccountsService,
    private readonly winningsService: WinningsService,
    private readonly winningsRepo: WinningsRepository,
  ) {}

  async getChallenge(challengeId: string) {
    const requestUrl = `${TC_API_BASE}/challenges/${challengeId}`;

    try {
      const challenge = await this.m2MService.m2mFetch<Challenge>(requestUrl);
      return challenge;
    } catch (e) {
      this.logger.error(
        `Challenge ${challengeId} details couldn't be fetched!`,
        e,
      );
    }
  }

  async getChallengeReviews(challengeId: string) {
    const requestUrl = `${TC_API_BASE}/reviews?challengeId=${challengeId}&status=COMPLETED&thin=true&perPage=9999`;

    try {
      const resposne = await this.m2MService.m2mFetch<{
        data: ChallengeReview[];
      }>(requestUrl);
      return resposne.data;
    } catch (e) {
      this.logger.error(
        `Challenge reviews couldn't be fetched for challenge ${challengeId}!`,
        e.message,
        e.status,
      );
    }
  }

  async getChallengeResources(challengeId: string) {
    try {
      const resources = await this.m2MService.m2mFetch<ChallengeResource[]>(
        `${TC_API_BASE}/resources?challengeId=${challengeId}`,
      );
      const resourceRoles = await this.m2MService.m2mFetch<ResourceRole[]>(
        `${TC_API_BASE}/resource-roles`,
      );

      const rolesMap = resourceRoles.reduce(
        (map, role) => {
          map[role.id] = camelCase(role.name);
          return map;
        },
        {} as { [key: string]: string },
      );

      return groupBy(resources, (r) => rolesMap[r.roleId]) as {
        [role: string]: ChallengeResource[];
      };
    } catch (e) {
      this.logger.error(
        `Challenge resources for challenge ${challengeId} couldn't be fetched!`,
        e,
      );
    }
  }

  generateWinnersPayments(challenge: Challenge): PaymentPayload[] {
    const { prizeSets, winners } = challenge;

    const isCancelledFailedReview =
      challenge.status.toLowerCase() ===
      ChallengeStatuses.CancelledFailedReview.toLowerCase();

    if (isCancelledFailedReview) {
      return [];
    }

    // generate placement payments
    const placementPrizes = orderBy(
      find(prizeSets, { type: 'PLACEMENT' })?.prizes,
      'value',
      'desc',
    );

    if (placementPrizes.length < winners.length) {
      throw new Error(
        'Task has incorrect number of placement prizes! There are more winners than prizes!',
      );
    }

    return winners.map((winner) => ({
      handle: winner.handle,
      amount: placementPrizes[winner.placement - 1].value,
      userId: winner.userId.toString(),
      type: challenge.task.isTask
        ? WinningsCategory.TASK_PAYMENT
        : WinningsCategory.CONTEST_PAYMENT,
      description:
        challenge.type === 'Task'
          ? challenge.name
          : `${challenge.name} - ${placeToOrdinal(winner.placement)} Place`,
    }));
  }

  generateCopilotPayment(
    challenge: Challenge,
    copilots: ChallengeResource[],
  ): PaymentPayload[] {
    const isCancelledFailedReview =
      challenge.status.toLowerCase() ===
      ChallengeStatuses.CancelledFailedReview.toLowerCase();

    const copilotPrizes =
      find(challenge.prizeSets, { type: 'COPILOT' })?.prizes ?? [];

    if (!copilotPrizes.length || isCancelledFailedReview) {
      return [];
    }

    if (!copilots?.length) {
      throw new Error('Task has a copilot prize but no copilot assigned!');
    }

    return copilots.map((copilot) => ({
      handle: copilot.memberHandle,
      amount: copilotPrizes[0].value,
      userId: copilot.memberId.toString(),
      type: WinningsCategory.COPILOT_PAYMENT,
    }));
  }

  async generateReviewersPayments(
    challenge: Challenge,
    reviewers: ChallengeResource[],
  ): Promise<PaymentPayload[]> {
    const placementPrizes = orderBy(
      find(challenge.prizeSets, { type: 'PLACEMENT' })?.prizes,
      'value',
      'desc',
    );

    // generate reviewer payments
    const firstPlacePrize = placementPrizes?.[0]?.value ?? 0;
    const hasMemberReviewers = find(challenge.reviewers, {
      isMemberReview: true,
    });

    const challengeReviews = await this.getChallengeReviews(challenge.id);

    if (
      !hasMemberReviewers ||
      !reviewers?.length ||
      !challengeReviews?.length
    ) {
      return [];
    }

    // For each challenge resource reviewer (can be main reviewer, approver, screener, etc)
    // we get the reviewer's reviews
    // and group them by phaseId
    // based on the phaseId, we're fetching the correct challenge reviewer type (which has assigned payments coefficients)
    // then we create the reviewe's payments for each phase based on the number of reviews done on each phase and the type of challenge reviewer assigned
    return reviewers
      .map((reviewer) => {
        // Find all reviews that were performed by this reviewer (case-insensitive match)
        const reviews = challengeReviews.filter(
          (r) =>
            r.reviewerHandle.toLowerCase() ===
            reviewer.memberHandle.toLowerCase(),
        );

        // Group the reviews by their associated phaseId
        return Object.entries(groupBy(reviews, 'phaseId')).map(
          ([chPhaseId, phaseReviews]) => {
            // Find the corresponding phase object in the challenge definition using its id
            const phaseId = find(challenge.phases, { id: chPhaseId })!.phaseId;
            // Find the reviewer entry in the challenge's reviewer list for this phase
            // (be sure to exclude ai reviews)
            const challengeReviewer = find(challenge.reviewers, {
              isMemberReview: true,
              phaseId,
            })!;

            return {
              handle: reviewer.memberHandle,
              userId: reviewer.memberId.toString(),
              amount: Math.ceil(
                (challengeReviewer.fixedAmount ?? 0) +
                  (challengeReviewer.baseCoefficient ?? 0) * firstPlacePrize +
                  (challengeReviewer.incrementalCoefficient ?? 0) *
                    firstPlacePrize *
                    phaseReviews.length,
              ),
              type: WinningsCategory.REVIEW_BOARD_PAYMENT,
              description: `${challenge.name} - ${phaseReviews[0].phaseName}`,
            };
          },
        );
      })
      .flat();
  }

  async getChallengePayments(challenge: Challenge) {
    this.logger.log(
      `Generating payments for challenge ${challenge.name} (${challenge.id}).`,
    );

    const challengeResources = await this.getChallengeResources(challenge.id);

    if (!challengeResources || isEmpty(challengeResources)) {
      throw new Error('Missing challenge resources!');
    }

    const winnersPayments = this.generateWinnersPayments(challenge);
    const copilotPayments = this.generateCopilotPayment(
      challenge,
      challengeResources.copilot,
    );

    let reviewersPayments;
    try {
      reviewersPayments = await this.generateReviewersPayments(
        challenge,
        uniqBy(
          [
            ...challengeResources.reviewer,
            ...challengeResources.checkpointScreener,
            ...challengeResources.checkpointReviewer,
            ...challengeResources.screener,
            ...challengeResources.approver,
          ],
          'memberId',
        ),
      );
    } catch (e) {
      console.log('er', e);
    }

    const payments: PaymentPayload[] = [
      ...winnersPayments,
      ...copilotPayments,
      ...reviewersPayments,
    ];

    const totalAmount = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    return payments.map((payment) => ({
      winnerId: payment.userId.toString(),
      type: WinningsType.PAYMENT,
      origin: 'Topcoder',
      category: payment.type,
      title: challenge.name,
      description: payment.description || challenge.name,
      externalId: challenge.id,
      details: [
        {
          totalAmount: payment.amount,
          grossAmount: payment.amount,
          installmentNumber: 1,
          currency: 'USD',
          billingAccount: `${challenge.billing.billingAccountId}`,
          challengeFee: totalAmount * challenge.billing.markup,
        },
      ],
      attributes: {
        billingAccountId: challenge.billing.billingAccountId,
        payroll: includes(
          TGBillingAccounts,
          parseInt(challenge.billing.billingAccountId),
        ),
      },
    }));
  }

  private async createPayments(challenge: Challenge, userId: string) {
    const existingPayments = (
      await this.winningsRepo.searchWinnings({
        externalIds: [challenge.id],
      } as WinningRequestDto)
    )?.data?.winnings;

    if (existingPayments?.length > 0) {
      this.logger.log(
        `Payments already exist for challenge ${challenge.id}, skipping payment generation`,
      );
      throw new Error(
        `Payments already exist for challenge ${challenge.id}, skipping payment generation`,
      );
    }

    const payments = await this.getChallengePayments(challenge);
    const totalAmount = payments.reduce(
      (sum, payment) => sum + payment.details[0].totalAmount,
      0,
    );

    const baValidation = {
      challengeId: challenge.id,
      billingAccountId: +challenge.billing.billingAccountId,
      markup: challenge.billing.markup,
      status: challenge.status,
      totalPrizesInCents: totalAmount * 100,
    };

    if (challenge.billing?.clientBillingRate != null) {
      baValidation.markup = challenge.billing.clientBillingRate;
    }

    await Promise.all(
      payments.map(async (p) => {
        try {
          await this.winningsService.createWinningWithPayments(p, userId);
        } catch (e) {
          this.logger.log(
            `Failed to create winnings payment for user ${p.winnerId}!`,
            e,
          );
        }
      }),
    );

    this.logger.log('Task Completed. locking consumed budget', baValidation);
    await this.baService.lockConsumeAmount(baValidation);
  }

  async generateChallengePayments(challengeId: string, userId: string) {
    const challenge = await this.getChallenge(challengeId);

    if (!challenge) {
      throw new Error('Challenge not found!');
    }

    const allowedStatuses = [
      ChallengeStatuses.Completed.toLowerCase(),
      ChallengeStatuses.CancelledFailedReview.toLowerCase(),
    ];

    if (!allowedStatuses.includes(challenge.status.toLowerCase())) {
      throw new Error("Challenge isn't in a payable status!");
    }

    // need to read for update (LOCK the rows)
    try {
      await this.prisma.challenge_lock.create({
        data: { external_id: challenge.id },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        this.logger.log(`Challenge Lock already acquired for ${challenge.id}`);
        // P2002 = unique constraint failed → lock already exists
        throw new ConflictException(
          `Challenge Lock already acquired for ${challenge.id}`,
        );
      }
      throw err;
    }

    try {
      await this.createPayments(challenge, userId);
    } catch (error) {
      if (error.message.includes('Lock already acquired')) {
        throw new ConflictException(
          'Another payment operation is in progress.',
        );
      } else {
        throw error;
      }
    } finally {
      await this.prisma.challenge_lock
        .deleteMany({
          where: { external_id: challenge.id },
        })
        .catch(() => {
          // swallow errors if lock was already released
        });
    }
  }
}
