import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TopcoderMembersService {
  async getHandlesByUserIds(userIds: string[]) {
    const requestUrl = `${process.env.TOPCODER_API_BASE_URL}/members?${userIds.map((i) => `userIds[]=${i}`).join('&')}&fields=handle,userId`;

    const { data } = await axios.get(requestUrl);
    return Object.fromEntries(
      data.map(({ handle, userId }) => [userId, handle] as string[]),
    );
  }
}
