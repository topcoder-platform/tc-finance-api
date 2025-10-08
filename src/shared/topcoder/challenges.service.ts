import { Injectable } from '@nestjs/common';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';
import { payment_status } from '@prisma/client';
import { Logger } from 'src/shared/global';

const { TOPCODER_API_BASE_URL } = ENV_CONFIG;

export interface WithdrawUpdateData {
  userId: number;
  status: string;
  datePaid: string;
}

export interface AdminPaymentUpdateData {
  userId: number;
  status: string;
  amount: number;
  releaseDate: string;
}

const mapStatus = (payoutData: WithdrawUpdateData | AdminPaymentUpdateData) => {
  return {
    ...payoutData,
    status: {
      [payment_status.CANCELLED]: 'Cancelled',
      [payment_status.FAILED]: 'Failed',
      [payment_status.ON_HOLD]: 'OnHold',
      [payment_status.ON_HOLD_ADMIN]: 'OnHoldAdmin',
      [payment_status.OWED]: 'Owed',
      [payment_status.PAID]: 'Paid',
      [payment_status.PROCESSING]: 'Processing',
      [payment_status.RETURNED]: 'Returned',
    }[payoutData.status],
  };
};

@Injectable()
export class TopcoderChallengesService {
  private readonly logger = new Logger(TopcoderChallengesService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  async updateLegacyPayments(
    challengeId: string,
    payoutData: WithdrawUpdateData | AdminPaymentUpdateData,
  ) {
    const requestData = mapStatus(payoutData);
    const requestUrl = `${TOPCODER_API_BASE_URL}/challenges/${challengeId}/legacy-payment`;

    this.logger.debug(
      `Updating legacy payment for challenge ${challengeId} with data: ${JSON.stringify(requestData, null, 2)}`,
    );

    try {
      const response = await this.m2MService.m2mFetch(requestUrl, {
        method: 'PATCH',
        body: JSON.stringify(requestData),
      });

      this.logger.debug(
        `Response from updating legacy payment for challenge ${challengeId}: ${JSON.stringify(response, null, 2)}`,
      );

      return response;
    } catch (e) {
      this.logger.error(
        `Failed to update legacy payment for challenge ${challengeId}! Error: ${e?.message ?? e}`,
        e,
      );
      throw e;
    }
  }
}
