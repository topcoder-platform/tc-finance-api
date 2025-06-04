import { chunk } from 'lodash';
import { Injectable } from '@nestjs/common';
import { MEMBER_FIELDS } from './member.types';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

const { TOPCODER_API_BASE_URL } = ENV_CONFIG;

@Injectable()
export class TopcoderMembersService {
  private readonly logger = new Logger(TopcoderMembersService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}
  /**
   * Retrieves a mapping of user IDs to their corresponding handles from the Topcoder API.
   *
   * @param userIds - An array of user IDs to fetch handles for.
   * @returns A promise that resolves to an object where the keys are user IDs and the values are handles.
   *          If the API request fails, an empty object is returned.
   *
   * @throws Will log an error to the console if the API request fails.
   */
  async getMembersInfo<T extends Record<string, any>>(
    filter: 'userIds' | 'handles',
    filterValue: string[],
    options = {} as { fields?: MEMBER_FIELDS[] },
  ): Promise<T[]> {
    // Remove duplicate user IDs to avoid redundant API calls
    const { fields = ['handle', 'userId'] } = options;
    const uniqFilterValues = [...new Set(filterValue.filter(Boolean)).values()];

    this.logger.debug(
      `Fething members info with filters ${filter}=${JSON.stringify(uniqFilterValues)}, and fields ${fields.join(',')}`,
    );

    let m2mToken: string | undefined;
    try {
      m2mToken = await this.m2MService.getToken();
    } catch (e) {
      this.logger.error(
        'Failed to fetch m2m token for fetching member details!',
        e.message ?? e,
      );
    }

    // Split the unique user IDs into chunks of 30 to comply with API request limits
    const requests = chunk(uniqFilterValues, 30).map((chunk) => {
      const requestUrl = `${TOPCODER_API_BASE_URL}/members?${chunk.map((id) => `${filter}[]=${id}`).join('&')}&fields=${fields.join(',')}`;
      return fetch(requestUrl, {
        headers: { Authorization: `Bearer ${m2mToken}` },
      }).then(async (response) => {
        const jsonResponse = await response.json();
        return jsonResponse as T[];
      });
    });

    try {
      // Execute all API requests in parallel and flatten the resulting data
      const data = await Promise.all(requests).then((d) => d.flat());

      this.logger.debug(
        `Successfully fetched members info for filters ${filter}=${JSON.stringify(uniqFilterValues)}. ${data?.length ?? 0} users found!`,
      );
      return data;
    } catch (e) {
      this.logger.error(
        'Failed to fetch tc members handles!',
        e?.message ?? e,
        e,
      );
      return [];
    }
  }

  async getMemberInfoByUserId<T extends Record<string, any>>(
    userId: string,
    fields?: MEMBER_FIELDS[],
  ): Promise<T | undefined> {
    const response = await this.getMembersInfo('userIds', [userId], { fields });

    return response?.[0] as T;
  }

  async getMembersInfoByUserId<T extends Record<string, any>>(
    userIds: string[],
    fields?: MEMBER_FIELDS[],
  ): Promise<{ [handle: string]: T }> {
    const response = await this.getMembersInfo('userIds', userIds, { fields });

    // Transform the API response into a mapping of user IDs to the requested fields
    const result = Object.fromEntries(
      response.map((user) => [user.userId, user]),
    ) as {
      [userId: string]: T;
    };

    return result;
  }

  async getMemberInfoByHandle<T extends Record<string, any>>(
    handle: string,
    fields?: MEMBER_FIELDS[],
  ): Promise<T | undefined> {
    const response = await this.getMembersInfo('handles', [handle], { fields });

    return response?.[0] as T;
  }

  async getMembersInfoByHandle<T extends Record<string, any>>(
    handles: string[],
    fields?: MEMBER_FIELDS[],
  ): Promise<{ [handle: string]: T }> {
    const response = await this.getMembersInfo('handles', handles, { fields });

    // Transform the API response into a mapping of user IDs to the requested fields
    const result = Object.fromEntries(
      response.map((user) => [user.handle, user]),
    ) as {
      [handle: string]: T;
    };

    return result;
  }
}
