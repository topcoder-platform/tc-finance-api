import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

import { TopcoderM2MService } from './topcoder-m2m.service';

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
  approvalApprovedBy?: string | null;
  billing?: {
    billingAccountId?: number | string | null;
    clientBillingRate?: number | string | null;
    markup?: number | string | null;
  };
  createdBy?: string;
  id: string;
  name: string;
  projectId: number;
  status?: string;
}

export interface TopcoderProjectInfo {
  id: number;
  name: string;
}

interface TopcoderChallengeSearchResult {
  challenges?: TopcoderChallengeInfo[];
  total?: number;
}

interface TopcoderProjectPhaseProduct {
  details?: {
    challengeGuid?: string | null;
    [key: string]: unknown;
  } | null;
  name?: string | null;
}

interface TopcoderProjectPhase {
  products?: TopcoderProjectPhaseProduct[] | null;
}

@Injectable()
export class TopcoderChallengesService {
  private readonly logger = new Logger(TopcoderChallengesService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  async getChallengeById(
    challengeId: string,
  ): Promise<TopcoderChallengeInfo | undefined> {
    try {
      return await this.m2MService.m2mFetch<TopcoderChallengeInfo>(
        `${TC_API_V6_BASE}/challenges/${challengeId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch challenge ${challengeId}`,
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  }

  /**
   * Finds a project challenge whose title matches an engagement name.
   *
   * @param projectId Connect project id stored on the engagement payment.
   * @param title engagement title used as the challenge name in Work Manager.
   * @returns the best matching challenge, if any.
   */
  /**
   * Finds a challenge id stored on a Connect project phase product for an
   * engagement title.
   */
  async findChallengeIdFromProjectPhases(
    projectId: string | number,
    engagementTitle: string,
  ): Promise<string | undefined> {
    const normalizedProjectId = String(projectId ?? '').trim();
    const normalizedTitle = String(engagementTitle ?? '').trim().toLowerCase();

    if (!normalizedProjectId || !normalizedTitle) {
      return undefined;
    }

    try {
      const params = new URLSearchParams({
        fields: 'id,name,products,status',
      });
      const phases = await this.m2MService.m2mFetch<TopcoderProjectPhase[]>(
        `${TC_API_V6_BASE}/projects/${encodeURIComponent(normalizedProjectId)}/phases?${params.toString()}`,
      );

      for (const phase of Array.isArray(phases) ? phases : []) {
        for (const product of Array.isArray(phase?.products)
          ? phase.products
          : []) {
          const challengeGuid = product?.details?.challengeGuid;

          if (!challengeGuid) {
            continue;
          }

          const productName = String(product?.name ?? '')
            .trim()
            .toLowerCase();

          if (
            productName === normalizedTitle ||
            productName.includes(normalizedTitle) ||
            normalizedTitle.includes(productName)
          ) {
            return String(challengeGuid).trim() || undefined;
          }
        }
      }

      return undefined;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve challenge id from project ${normalizedProjectId} phases`,
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  }

  async findChallengeByProjectAndTitle(
    projectId: string | number,
    title: string,
  ): Promise<TopcoderChallengeInfo | undefined> {
    const normalizedProjectId = String(projectId ?? '').trim();
    const normalizedTitle = String(title ?? '').trim();

    if (!normalizedProjectId || !normalizedTitle) {
      return undefined;
    }

    try {
      const params = new URLSearchParams({
        name: normalizedTitle,
        page: '1',
        perPage: '10',
        projectId: normalizedProjectId,
      });
      const result = await this.m2MService.m2mFetch<TopcoderChallengeSearchResult>(
        `${TC_API_V6_BASE}/challenges?${params.toString()}`,
      );
      const challenges = Array.isArray(result?.challenges)
        ? result.challenges
        : [];

      if (!challenges.length) {
        return undefined;
      }

      const exactMatch = challenges.find(
        (challenge) =>
          challenge.name?.trim().toLowerCase() ===
          normalizedTitle.toLowerCase(),
      );

      return exactMatch ?? challenges[0];
    } catch (error) {
      this.logger.warn(
        `Failed to search challenges for project ${normalizedProjectId} and title ${normalizedTitle}`,
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  }

  async getProjectById(
    projectId: number,
  ): Promise<TopcoderProjectInfo | undefined> {
    try {
      return await this.m2MService.m2mFetch<TopcoderProjectInfo>(
        `${TC_API_V6_BASE}/projects/${projectId}`,
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
