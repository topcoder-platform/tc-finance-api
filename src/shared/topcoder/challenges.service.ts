import { Injectable, Logger } from '@nestjs/common';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';
import { payment_status } from '@prisma/client';

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
export class TopcoderCallengesService {
  private readonly logger = new Logger(TopcoderCallengesService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  async updateLegacyPayments(
    challengeId: string,
    payoutData: WithdrawUpdateData | AdminPaymentUpdateData,
  ) {
    const requestData = mapStatus(payoutData);

    let m2mToken: string | undefined;
    try {
      m2mToken = await this.m2MService.getToken();
    } catch (e) {
      this.logger.error(
        'Failed to fetch m2m token for fetching member details!',
        e.message ?? e,
      );
    }
    const requestUrl = `${TOPCODER_API_BASE_URL}/challenges/${challengeId}/legacy-payment`;

    this.logger.debug(
      `Updating legacy payment for challenge ${challengeId} with data: ${JSON.stringify(requestData, null, 2)}`,
    );

    try {
      const response = await fetch(requestUrl, {
        method: 'PATCH',
        body: JSON.stringify(requestData),
        headers: {
          Authorization: `Bearer ${m2mToken}`,
          'Content-Type': 'application/json',
        },
      });

      const jsonResponse: { [key: string]: string } = await response.json();

      if (response.status > 299) {
        throw new Error(jsonResponse.message ?? JSON.stringify(jsonResponse));
      }

      this.logger.debug(
        `Response from updating legacy payment for challenge ${challengeId}: ${JSON.stringify(jsonResponse, null, 2)}`,
      );

      return jsonResponse;
    } catch (e) {
      this.logger.error(
        `Failed to update legacy payment for challenge ${challengeId}! Error: ${e?.message ?? e}`,
        e,
      );
      throw e;
    }
  }
}
