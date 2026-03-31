import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

import { TopcoderM2MService } from './topcoder-m2m.service';

const { TOPCODER_API_V6_BASE_URL: TC_API_BASE } = ENV_CONFIG;

export interface TopcoderAssignmentContext {
  agreementRate?: string | null;
  assignmentId: string;
  durationMonths?: number | null;
  endDate?: string | null;
  engagementId: string;
  engagementTitle: string;
  memberHandle: string;
  memberId: string;
  otherRemarks?: string | null;
  projectId: string;
  projectName?: string;
  ratePerHour?: string | null;
  standardHoursPerWeek?: number | null;
  startDate?: string | null;
  status: string;
}

@Injectable()
export class TopcoderEngagementsService {
  private readonly logger = new Logger(TopcoderEngagementsService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  /**
   * Retrieves the assignment context from the engagements API.
   *
   * @param assignmentId engagement-assignment identifier stored on the winning.
   * @returns assignment context with engagement and project metadata.
   * @throws {Error} When the engagements API request fails.
   */
  async getAssignmentContextById(
    assignmentId: string,
  ): Promise<TopcoderAssignmentContext> {
    const requestUrl = `${TC_API_BASE}/engagements/engagements/assignments/${assignmentId}/context`;

    try {
      return await this.m2MService.m2mFetch<TopcoderAssignmentContext>(
        requestUrl,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch engagement assignment context for ${assignmentId}`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
