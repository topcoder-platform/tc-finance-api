import { ChallengeStatuses } from '../../dto/challenge.dto';

jest.mock('src/config', () => ({
  ENV_CONFIG: {
    TGBillingAccounts: [],
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    debug = jest.fn();

    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

import { ChallengesService } from './challenges.service';

describe('ChallengesService', () => {
  it('skips creating payments for fun challenges', async () => {
    const prisma = {
      challenge_lock: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const service = new ChallengesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const challenge = {
      funChallenge: true,
      id: '11111111-1111-1111-1111-111111111111',
      name: 'MM 163',
      status: ChallengeStatuses.Completed,
    };
    const createPaymentsSpy = jest
      .spyOn(service as any, 'createPayments')
      .mockResolvedValue(undefined);

    jest.spyOn(service, 'getChallenge').mockResolvedValue(challenge as any);

    await service.generateChallengePayments(
      '11111111-1111-1111-1111-111111111111',
      'test-user',
    );

    expect(createPaymentsSpy).not.toHaveBeenCalled();
    expect(prisma.challenge_lock.create).not.toHaveBeenCalled();
  });
});
