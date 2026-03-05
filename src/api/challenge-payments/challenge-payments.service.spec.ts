jest.mock('src/shared/global', () => ({
  Logger: class {
    debug = jest.fn();

    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

jest.mock('src/config', () => ({
  ENV_CONFIG: {
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

import { ChallengePaymentsService } from './challenge-payments.service';

describe('ChallengePaymentsService', () => {
  let findManyMock: jest.Mock;
  let m2mFetchMock: jest.Mock;
  let service: ChallengePaymentsService;

  beforeEach(() => {
    findManyMock = jest.fn().mockResolvedValue([]);
    m2mFetchMock = jest.fn();

    service = new ChallengePaymentsService(
      {
        winnings: {
          findMany: findManyMock,
        },
      } as any,
      {
        m2mFetch: m2mFetchMock,
      } as any,
    );
  });

  it('returns all challenge payments for managers', async () => {
    m2mFetchMock
      .mockResolvedValueOnce([
        {
          memberHandle: 'manager-user',
          memberId: '123',
          roleId: 'manager-role-id',
        },
      ])
      .mockResolvedValueOnce([
        {
          fullWriteAccess: false,
          id: 'manager-role-id',
          name: 'Manager',
        },
      ]);

    await service.listChallengePayments({
      auth0User: { roles: ['Topcoder User'] },
      challengeId: 'challenge-id',
      isMachineToken: false,
      requestUserId: '123',
      winnerOnly: false,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.winner_id).toBeUndefined();
  });

  it('keeps winner filtering for users without challenge-wide access', async () => {
    m2mFetchMock
      .mockResolvedValueOnce([
        {
          memberHandle: 'reviewer-user',
          memberId: '456',
          roleId: 'reviewer-role-id',
        },
      ])
      .mockResolvedValueOnce([
        {
          fullWriteAccess: false,
          id: 'reviewer-role-id',
          name: 'Reviewer',
        },
      ]);

    await service.listChallengePayments({
      auth0User: { roles: ['Topcoder User'] },
      challengeId: 'challenge-id',
      isMachineToken: false,
      requestUserId: '456',
      winnerOnly: false,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.winner_id).toBe('456');
  });
});
