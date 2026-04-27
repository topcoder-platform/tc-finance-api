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
  id: string;
  name: string;
  projectId: number;
  createdBy?: string;
}

export interface TopcoderProjectInfo {
  id: number;
  name: string;
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
