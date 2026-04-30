jest.mock('src/config', () => ({
  ENV_CONFIG: {
    TGBillingAccounts: [],
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

const mockBaTx = {
  $executeRawUnsafe: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};
const mockBaClient = {
  $transaction: jest.fn(),
};

jest.mock('src/shared/global/ba-prisma.client', () => ({
  getBaClient: jest.fn(() => mockBaClient),
}));

import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { BillingAccountsService } from './billing-accounts.service';

describe('BillingAccountsService', () => {
  let service: BillingAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBaTx.$executeRawUnsafe.mockResolvedValue(undefined);
    mockBaTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([]);
    mockBaClient.$transaction.mockImplementation(
      (callback: (tx: typeof mockBaTx) => unknown) => callback(mockBaTx),
    );

    service = new BillingAccountsService({} as any);
  });

  it('locks draft challenge funds until the challenge is completed', async () => {
    const consumeAmountSpy = jest
      .spyOn(service, 'consumeAmount')
      .mockResolvedValue(undefined);
    const lockAmountSpy = jest
      .spyOn(service, 'lockAmount')
      .mockResolvedValue(undefined);

    await service.lockConsumeAmount({
      billingAccountId: 80001012,
      challengeId: 'challenge-id',
      markup: 0.2,
      status: ChallengeStatuses.Draft,
      totalPrizesInCents: 25000,
    });

    expect(lockAmountSpy).toHaveBeenCalledWith(80001012, {
      amount: 300,
      challengeId: 'challenge-id',
    });
    expect(consumeAmountSpy).not.toHaveBeenCalled();
  });

  it('consumes cancelled challenge funds when generated payments exist', async () => {
    const consumeAmountSpy = jest
      .spyOn(service, 'consumeAmount')
      .mockResolvedValue(undefined);
    const lockAmountSpy = jest
      .spyOn(service, 'lockAmount')
      .mockResolvedValue(undefined);

    await service.lockConsumeAmount({
      billingAccountId: 80001012,
      challengeId: 'challenge-id',
      markup: 0.2,
      status: ChallengeStatuses.CancelledFailedReview,
      totalPrizesInCents: 25000,
    });

    expect(consumeAmountSpy).toHaveBeenCalledWith(80001012, {
      amount: 300,
      challengeId: 'challenge-id',
    });
    expect(lockAmountSpy).not.toHaveBeenCalled();
  });

  it('unlocks cancelled challenge funds when no payments exist', async () => {
    const consumeAmountSpy = jest
      .spyOn(service, 'consumeAmount')
      .mockResolvedValue(undefined);
    const lockAmountSpy = jest
      .spyOn(service, 'lockAmount')
      .mockResolvedValue(undefined);

    await service.lockConsumeAmount({
      billingAccountId: 80001012,
      challengeId: 'challenge-id',
      markup: 0.2,
      status: ChallengeStatuses.CancelledClientRequest,
      totalPrizesInCents: 0,
    });

    expect(lockAmountSpy).toHaveBeenCalledWith(80001012, {
      amount: 0,
      challengeId: 'challenge-id',
    });
    expect(consumeAmountSpy).not.toHaveBeenCalled();
  });

  it('deletes stale engagement consumed rows when no active amounts remain', async () => {
    mockBaTx.$queryRawUnsafe
      .mockReset()
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ id: 'consumed-row-1' }]);

    await service.syncEngagementConsumeAmounts({
      amounts: [],
      billingAccountId: 80001012,
      externalId: 'assignment-1',
    });

    expect(mockBaTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"externalId" = $2'),
      80001012,
      'assignment-1',
    );
    expect(mockBaTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "ConsumedAmount"'),
      'consumed-row-1',
    );
  });

  it('syncs engagement consumed rows to the active ledger amounts', async () => {
    mockBaTx.$queryRawUnsafe
      .mockReset()
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ id: 'consumed-row-1' }, { id: 'stale-row-1' }]);

    await service.syncEngagementConsumeAmounts({
      amounts: [24.2, 12],
      billingAccountId: 80001012,
      externalId: 'assignment-1',
    });

    expect(mockBaTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "ConsumedAmount"'),
      24.2,
      'consumed-row-1',
    );
    expect(mockBaTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "ConsumedAmount"'),
      12,
      'stale-row-1',
    );
    expect(mockBaTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "ConsumedAmount"'),
      expect.any(String),
    );
  });

  it('syncs legacy consumed rows with the aggregate active amount', async () => {
    mockBaTx.$queryRawUnsafe
      .mockReset()
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValueOnce([{ id: 'legacy-row-1' }]);

    await service.syncEngagementConsumeAmounts({
      amounts: [24.2, 12],
      billingAccountId: 80001012,
      externalId: 'assignment-1',
    });

    expect(mockBaTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"challengeId" = $2'),
      80001012,
      'assignment-1',
    );
    expect(mockBaTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "ConsumedAmount"'),
      36.2,
      'legacy-row-1',
    );
  });
});
