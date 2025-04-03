import axios from 'axios';
import { chunk } from 'lodash';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TopcoderMembersService {
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
    const requests = chunk(uniqUserIds, 100).map((chunk) => {
      const requestUrl = `${process.env.TOPCODER_API_BASE_URL}/members?${chunk.map((id) => `userIds[]=${id}`).join('&')}&fields=handle,userId`;
      return axios
        .get(requestUrl)
        .then(({ data }) => data as { handle: string; userId: string });
    });

    try {
      // Execute all API requests in parallel and flatten the resulting data
      const data = await Promise.all(requests).then(d => d.flat());
      // Transform the API response into a mapping of user IDs to handles
      return Object.fromEntries(
        data.map(({ handle, userId }) => [userId, handle] as string[]),
      ) as { [userId: string]: string };
    } catch (e) {
      console.error('Failed to fetch tc members handles!', e?.message ?? e, e);
      return {};
    }
  }
}
