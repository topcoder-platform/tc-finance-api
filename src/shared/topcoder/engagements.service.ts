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

export interface TopcoderEngagementAssignment {
  agreementRate?: string | null;
  durationMonths?: number | string | null;
  endDate?: string | null;
  engagementId?: string | number | null;
  id: string | number;
  memberHandle?: string | null;
  memberId?: string | number | null;
  otherRemarks?: string | null;
  ratePerHour?: string | null;
  startDate?: string | null;
  standardHoursPerWeek?: number | string | null;
}

export interface TopcoderEngagementDetails {
  assignments?: TopcoderEngagementAssignment[] | null;
  id: string | number;
  project?: {
    id?: string | number | null;
    name?: string | null;
  } | null;
  projectId?: string | number | null;
  projectName?: string | null;
  title?: string | null;
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

  /**
   * Retrieves an engagement record, including assignment metadata, from the
   * engagements API.
   *
   * @param engagementId engagement identifier stored on the winning external ID.
   * @returns engagement details with assignments used to hydrate wallet-admin
   * payment details.
   * @throws {Error} When the engagements API request fails.
   */
  async getEngagementById(
    engagementId: string,
  ): Promise<TopcoderEngagementDetails> {
    const requestUrl = `${TC_API_BASE}/engagements/engagements/${engagementId}`;

    try {
      return await this.m2MService.m2mFetch<TopcoderEngagementDetails>(
        requestUrl,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch engagement details for ${engagementId}`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
