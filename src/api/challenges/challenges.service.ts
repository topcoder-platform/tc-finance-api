import { includes, isEmpty, sortBy, find, camelCase, groupBy } from 'lodash';
import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';
import { Challenge, ChallengeResource, ResourceRole } from './models';
import { BillingAccountsService } from 'src/shared/topcoder/billing-accounts.service';
import { TopcoderM2MService } from 'src/shared/topcoder/topcoder-m2m.service';
import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { WinningsService } from '../winnings/winnings.service';
import { WinningsCategory, WinningsType } from 'src/dto/winning.dto';
import { WinningsRepository } from '../repository/winnings.repo';

const placeToOrdinal = (place: number) => {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";

  return `${place}th`;
}

const {
  TOPCODER_API_V6_BASE_URL,
  TGBillingAccounts,
} = ENV_CONFIG;


@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    private readonly m2MService: TopcoderM2MService,
    private readonly baService: BillingAccountsService,
    private readonly winningsService: WinningsService,
    private readonly winningsRepo: WinningsRepository,
  ) {}

  async getChallenge(challengeId: string) {
    const requestUrl = `${TOPCODER_API_V6_BASE_URL}/challenges/${challengeId}`;

    try {
      const challenge = await this.m2MService.m2mFetch<Challenge>(requestUrl);
      this.logger.log(JSON.stringify(challenge, null, 2));
      return challenge;
    } catch(e) {
      this.logger.error(`Challenge ${challengeId} details couldn't be fetched!`, e);
    }
  }

  async getChallengeResources(challengeId: string) {
    try {
      const resources = await this.m2MService.m2mFetch<ChallengeResource[]>(`${TOPCODER_API_V6_BASE_URL}/resources?challengeId=${challengeId}`);
      const resourceRoles = await this.m2MService.m2mFetch<ResourceRole[]>(`${TOPCODER_API_V6_BASE_URL}/resource-roles`);

      const rolesMap = resourceRoles.reduce((map, role) => {
        map[role.id] = camelCase(role.name);
        return map;
      }, {} as {[key: string]: string});

      return groupBy(resources, (r) => rolesMap[r.roleId]) as {[role: string]: ChallengeResource[]};
    } catch(e) {
      this.logger.error(`Challenge resources for challenge ${challengeId} couldn\'t be fetched!`, e);
    }
  }

  async getChallengePayments(challenge: Challenge) {
    this.logger.log(
      `Generating payments for challenge ${challenge.name} (${challenge.id}).`
    );
    const challengeResources = await this.getChallengeResources(challenge.id);

    if (!challengeResources || isEmpty(challengeResources)) {
      throw new Error('Missing challenge resources!');
    }

    const payments = [] as {
      handle: string;
      amount: number;
      userId: string;
      type: WinningsCategory;
      description?: string;
    }[];

    const { prizeSets, winners, reviewers } = challenge;

    // generate placement payments
    const placementPrizes = sortBy(find(prizeSets, {type: 'PLACEMENT'})?.prizes, 'value');
    if (placementPrizes.length < winners.length) {
      throw new Error('Task has incorrect number of placement prizes! There are more winners than prizes!');
    }

    winners.forEach((winner) => {
      payments.push({
        handle: winner.handle,
        amount: placementPrizes[winner.placement - 1].value,
        userId: winner.userId.toString(),
        type: challenge.task.isTask ? WinningsCategory.TASK_PAYMENT : WinningsCategory.CONTEST_PAYMENT,
        description: challenge.type === 'Task' ? challenge.name : `${challenge.name} - ${placeToOrdinal(winner.placement)} Place`,
      });
    });

    // generate copilot payments
    const copilotPrizes = find(prizeSets, {type: 'COPILOT'})?.prizes ?? [];
    if (copilotPrizes.length) {
      const copilots = challengeResources.copilot;

      if (!copilots?.length) {
        throw new Error('Task has a copilot prize but no copilot assigned!');
      }

      copilots.forEach((copilot) => {
        payments.push({
          handle: copilot.memberHandle,
          amount: copilotPrizes[0].value,
          userId: copilot.memberId.toString(),
          type: WinningsCategory.COPILOT_PAYMENT,
        })
      })
    }

    // generate reviewer payments
    const firstPlacePrize = placementPrizes[0].value;
    const challengeReviewer = find(reviewers, { isMemberReview: true });

    if (challengeReviewer && challengeResources.reviewer) {
      challengeResources.reviewer?.forEach((reviewer) => {
        payments.push({
          handle: reviewer.memberHandle,
          userId: reviewer.memberId.toString(),
          amount: Math.round((challengeReviewer.basePayment ?? 0) + ((challengeReviewer.incrementalPayment ?? 0) * challenge.numOfSubmissions) * firstPlacePrize),
          type: WinningsCategory.REVIEW_BOARD_PAYMENT,
        })
      });
    }

    const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
    return payments.map((payment) => ({
      winnerId: payment.userId.toString(),
      type: WinningsType.PAYMENT,
      origin: "Topcoder",
      category: payment.type,
      title: challenge.name,
      description: payment.description || challenge.name,
      externalId: challenge.id,
      details: [{
        totalAmount: payment.amount,
        grossAmount: payment.amount,
        installmentNumber: 1,
        currency: "USD",
        billingAccount: `${challenge.billing.billingAccountId}`,
        challengeFee: totalAmount * challenge.billing.markup,
      }],
      attributes: {
        billingAccountId: challenge.billing.billingAccountId,
        payroll: includes(TGBillingAccounts, challenge.billing.billingAccountId),
      },
    }));
  }

  async generateChallengePayments(challengeId: string, userId: string) {
    const challenge = await this.getChallenge(challengeId);

    if (!challenge) {
      throw new Error('Challenge not found!');
    }

    if (challenge.status.toLowerCase() !== ChallengeStatuses.Completed.toLowerCase()) {
      throw new Error('Challenge isn\'t completed yet!');
    }

    const existingPayments = (await this.winningsRepo.searchWinnings({ externalIds: [challengeId] }))?.data?.winnings;
    if (existingPayments?.length > 0) {
      this.logger.log(`Payments already exist for challenge ${challengeId}, skipping payment generation`);
      throw new Error(`Payments already exist for challenge ${challengeId}, skipping payment generation`);
    }

    const payments = await this.getChallengePayments(challenge);
    const totalAmount = payments.reduce((sum, payment) => sum + payment.details[0].totalAmount, 0);

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

    await Promise.all(payments.map(p => this.winningsService.createWinningWithPayments(p,userId)));

    this.logger.log("Task Completed. locking consumed budget", baValidation);
    await this.baService.lockConsumeAmount(baValidation);
  }
}
