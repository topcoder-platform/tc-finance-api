import { chunk } from 'lodash';
import { Injectable } from '@nestjs/common';
import { MEMBER_FIELDS } from './member.types';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { ENV_CONFIG } from 'src/config';

const { TOPCODER_API_BASE_URL } = ENV_CONFIG;

@Injectable()
export class TopcoderMembersService {
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
      const requestUrl = `${TOPCODER_API_BASE_URL}/members?${chunk.map((id) => `userIds[]=${id}`).join('&')}&fields=handle,userId`;
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
      console.error('Failed to fetch tc members handles!', e?.message ?? e, e);
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
      console.error(
        'Failed to fetch m2m token for fetching member details!',
        e.message ?? e,
      );
    }
    const requestUrl = `${TOPCODER_API_BASE_URL}/members/${handle}${fields ? `?fields=${fields.join(',')}` : ''}`;

    try {
      const response: { [key: string]: string } = await fetch(requestUrl, {
        headers: { Authorization: `Bearer ${m2mToken}` },
      }).then((r) => r.json());
      return response;
    } catch (e) {
      console.error(
        `Failed to fetch tc member info for user '${handle}'! Error: `,
        e?.message ?? e,
        e,
      );
      return {};
    }
  }
}
