import { chunk } from 'lodash';
import { Injectable } from '@nestjs/common';
import { MEMBER_FIELDS } from './member.types';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

const { TOPCODER_API_V6_BASE_URL: TC_API_BASE } = ENV_CONFIG;

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
  async getHandlesByUserIds(userIds: string[]) {
    // Remove duplicate user IDs to avoid redundant API calls
    const uniqUserIds = [...new Set(userIds.filter(Boolean)).values()];

    // Split the unique user IDs into chunks of 100 to comply with API request limits
    const requests = chunk(uniqUserIds, 30).map((chunk) => {
      const requestUrl = `${TC_API_BASE}/members?${chunk.map((id) => `userIds[]=${id}`).join('&')}&fields=handle,userId`;
      return fetch(requestUrl).then(
        async (response) =>
          (await response.json()) as { handle: string; userId: string },
      );
    });

    try {
      // Execute all API requests in parallel and flatten the resulting data
      const data = await Promise.all(requests).then((d) => d.flat());
      // Transform the API response into a mapping of user IDs to handles
      return Object.fromEntries(
        data.map(({ handle, userId }) => [userId, handle] as string[]),
      ) as { [userId: string]: string };
    } catch (e) {
      this.logger.error(
        'Failed to fetch tc members handles!',
        e?.message ?? e,
        e,
      );
      return {};
    }
  }

  /**
   * Retrieves member information from the Topcoder API based on the user's handle.
   *
   * @param handle - The handle of the user whose information is to be retrieved.
   * @param options - Optional parameters for the request.
   * @param options.fields - An array of specific member fields to include in the response.
   *
   * @returns A promise that resolves to the member information object or an empty object if the request fails.
   *
   * @throws Will log an error message to the console if the API request fails.
   */
  async getMemberInfoByUserHandle(
    handle: string,
    options = {} as { fields: MEMBER_FIELDS[] },
  ) {
    const { fields } = options;

    let m2mToken: string | undefined;
    try {
      m2mToken = await this.m2MService.getToken();
    } catch (e) {
      this.logger.error(
        'Failed to fetch m2m token for fetching member details!',
        e.message ?? e,
      );
    }
    const requestUrl = `${TC_API_BASE}/members/${handle}${fields ? `?fields=${fields.join(',')}` : ''}`;

    try {
      const response = await fetch(requestUrl, {
        headers: { Authorization: `Bearer ${m2mToken}` },
      });

      const jsonResponse: { [key: string]: string } = await response.json();

      if (response.status > 299) {
        throw new Error(jsonResponse.message ?? JSON.stringify(jsonResponse));
      }

      return jsonResponse;
    } catch (e) {
      this.logger.error(
        `Failed to fetch tc member info for user '${handle}'! Error: ${e?.message ?? e}`,
        e,
      );
      throw e;
    }
  }

  /**
   * Retrieves member information from the Topcoder API based on the user's ID.
   *
   * @param userId - The ID of the user whose information is to be retrieved.
   * @param options - Optional parameters for the request.
   * @param options.fields - An array of specific member fields to include in the response.
   *
   * @returns A promise that resolves to the member information object or an empty object if the request fails.
   *
   * @throws Will log an error message to the console if the API request fails.
   */
  async getMemberInfoByUserId(
    userId: string,
    options = {} as { fields: MEMBER_FIELDS[] },
  ) {
    try {
      // Fetch the handle for the given userId
      const handlesMap = await this.getHandlesByUserIds([userId]);
      const handle = handlesMap[userId];

      if (!handle) {
        throw new Error(`Handle not found for userId: ${userId}`);
      }

      // Fetch member info using the handle
      return await this.getMemberInfoByUserHandle(handle, options);
    } catch (e) {
      this.logger.error(
        `Failed to fetch tc member info for userId '${userId}'! Error: ${e?.message ?? e}`,
        e,
      );
      throw e;
    }
  }
}
