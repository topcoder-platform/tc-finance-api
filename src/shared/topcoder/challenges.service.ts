import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

import {
  TopcoderM2MHttpError,
  TopcoderM2MService,
} from './topcoder-m2m.service';

const { TOPCODER_API_V6_BASE_URL: TC_API_V6_BASE } = ENV_CONFIG;

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

export interface TopcoderChallengeInfo {
  billing?: {
    billingAccountId?: number | string | null;
    clientBillingRate?: number | string | null;
    markup?: number | string | null;
  };
  createdBy?: string;
  id: string;
  metadata?: TopcoderChallengeMetadata[];
  name: string;
  projectId: number;
  status?: string;
}

export interface TopcoderChallengeMetadata {
  name: string;
  value: string;
}

const TEST_CHALLENGE_METADATA_NAME = 'is_test_challenge';

/**
 * Determines whether challenge metadata explicitly enables the test-challenge
 * flag used to suppress finance payment creation.
 *
 * @param challenge Challenge details returned by challenge-api-v6.
 * @returns `true` only for the exact metadata entry
 * `{ name: 'is_test_challenge', value: 'true' }`; false and missing metadata
 * remain payable.
 * @throws This function does not throw.
 */
export function isTestChallenge(
  challenge?: Pick<TopcoderChallengeInfo, 'metadata'>,
): boolean {
  return Boolean(
    challenge?.metadata?.some(
      ({ name, value }) =>
        name === TEST_CHALLENGE_METADATA_NAME && value === 'true',
    ),
  );
}

export interface TopcoderProjectInfo {
  id: number;
  name: string;
}

export interface TopcoderChallengeLookupOptions {
  throwOnNonNotFoundError?: boolean;
}

@Injectable()
export class TopcoderChallengesService {
  private readonly logger = new Logger(TopcoderChallengesService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  /**
   * Retrieves a challenge from challenge-api-v6.
   *
   * Existing admin consumers use the default best-effort behavior, which
   * returns `undefined` for every lookup failure. Payment creation opts into
   * strict behavior so only a definitive HTTP 404 is treated as a
   * non-challenge external ID; authentication, network, and upstream server
   * failures are rethrown before finance can create a payment.
   *
   * @param challengeId Challenge identifier to retrieve.
   * @param options Optional lookup error policy.
   * @returns Challenge details when found, otherwise `undefined` for a 404 or
   * for any lookup error under the default best-effort policy.
   * @throws The original non-404 lookup error when
   * `throwOnNonNotFoundError` is enabled.
   */
  async getChallengeById(
    challengeId: string,
    options: TopcoderChallengeLookupOptions = {},
  ): Promise<TopcoderChallengeInfo | undefined> {
    try {
      return await this.m2MService.m2mFetch<TopcoderChallengeInfo>(
        `${TC_API_V6_BASE}/challenges/${encodeURIComponent(challengeId)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch challenge ${challengeId}`,
        error instanceof Error ? error.message : error,
      );

      const isNotFound =
        error instanceof TopcoderM2MHttpError && error.status === 404;
      if (options.throwOnNonNotFoundError && !isNotFound) {
        throw error;
      }

      return undefined;
    }
  }

  async getProjectById(
    projectId: number,
  ): Promise<TopcoderProjectInfo | undefined> {
    try {
      return await this.m2MService.m2mFetch<TopcoderProjectInfo>(
        `${TC_API_V6_BASE}/projects/${encodeURIComponent(String(projectId))}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch project ${projectId}`,
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  }
}
