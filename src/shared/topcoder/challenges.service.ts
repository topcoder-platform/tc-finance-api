import { Injectable } from '@nestjs/common';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';
import { payment_status } from '@prisma/client';
import { Logger } from 'src/shared/global';
import axios from 'axios';

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

    const m2mToken = await this.m2MService.getToken();
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

  async searchByName(challengeName: string) {
    const m2mToken = await this.m2MService.getToken();
    const requestUrl = `${TOPCODER_API_BASE_URL}/challenges?name=${encodeURIComponent(challengeName)}`;

    this.logger.debug(
      `Fetching challenges ids by challenge name ${JSON.stringify(challengeName)}.`,
    );

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${m2mToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch challenges by name. Status: ${response.status}, Data: ${await response.text()}`,
        );
      }

      const jsonResponse: Record<string, any>[] = await response.json();

      this.logger.debug(
        `Successfully fetched ${jsonResponse.length} challenges from challenges api.`,
      );

      return jsonResponse;
    } catch (e) {
      const errorMessage = e.response?.data?.message ?? e.message;

      this.logger.error(
        `Failed to fetch challenges details for challenge name ${challengeName}! Error: ${errorMessage}`,
      );
      throw new Error(errorMessage ?? 'Axios Error');
    }
  }

  async getChallengesNameByChallengeIds(challengeIds: string[]) {
    if (!challengeIds.length) {
      return {};
    }

    const m2mToken = await this.m2MService.getToken();

    const requestUrl = `${TOPCODER_API_BASE_URL}/challenges`;

    this.logger.debug(
      `Fetching challenges names by challenges ids ${JSON.stringify(challengeIds)}.`,
    );

    try {
      /** Using axios because we can't send "BODY" for a GET request with fetch */
      const response = await axios.get(requestUrl, {
        method: 'GET',
        data: { ids: challengeIds },
        headers: {
          Authorization: `Bearer ${m2mToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status > 299) {
        throw new Error(
          `Failed to fetch challenges details. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`,
        );
      }

      const challengeNamesMap = Object.fromEntries(
        response.data.map((challenge) => [
          challenge.id as string,
          challenge.name as string,
        ]),
      );

      this.logger.debug(
        `Successfully fetched challenges names from challenges api: ${JSON.stringify(challengeNamesMap, null, 2)}`,
      );

      return challengeNamesMap;
    } catch (e) {
      const errorMessage = e.response?.data?.message ?? e.message;

      this.logger.error(
        `Failed to fetch challenges details for challenges ${challengeIds.join(',')}! Error: ${errorMessage}`,
      );
      throw new Error(errorMessage ?? 'Axios Error');
    }
  }
}
