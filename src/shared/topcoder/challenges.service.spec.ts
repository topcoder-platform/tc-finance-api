jest.mock('src/config', () => ({
  ENV_CONFIG: {
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    warn = jest.fn();
  },
}));

import { TopcoderChallengesService } from './challenges.service';
import { TopcoderM2MHttpError } from './topcoder-m2m.service';

describe('TopcoderChallengesService', () => {
  let m2MService: { m2mFetch: jest.Mock };
  let service: TopcoderChallengesService;

  beforeEach(() => {
    m2MService = { m2mFetch: jest.fn() };
    service = new TopcoderChallengesService(m2MService as any);
  });

  it('treats a definitive 404 as a non-challenge in strict lookup mode', async () => {
    m2MService.m2mFetch.mockRejectedValue(
      new TopcoderM2MHttpError({
        method: 'GET',
        responseBody: { message: 'Challenge not found' },
        status: 404,
        statusText: 'Not Found',
        url: 'https://api.topcoder-dev.com/v6/challenges/external-id',
      }),
    );

    await expect(
      service.getChallengeById('external-id', {
        throwOnNonNotFoundError: true,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'upstream server',
      new TopcoderM2MHttpError({
        method: 'GET',
        responseBody: { message: 'Unavailable' },
        status: 503,
        statusText: 'Service Unavailable',
        url: 'https://api.topcoder-dev.com/v6/challenges/challenge-id',
      }),
    ],
    ['authentication or network', new Error('M2M token unavailable')],
  ])('rethrows a %s failure in strict lookup mode', async (_, error) => {
    m2MService.m2mFetch.mockRejectedValue(error);

    await expect(
      service.getChallengeById('challenge-id', {
        throwOnNonNotFoundError: true,
      }),
    ).rejects.toBe(error);
  });

  it('preserves best-effort lookup behavior for existing callers', async () => {
    m2MService.m2mFetch.mockRejectedValue(new Error('M2M token unavailable'));

    await expect(
      service.getChallengeById('challenge-id'),
    ).resolves.toBeUndefined();
  });
});
