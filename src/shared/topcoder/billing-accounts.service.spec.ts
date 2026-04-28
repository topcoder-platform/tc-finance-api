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

import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { BillingAccountsService } from './billing-accounts.service';

describe('BillingAccountsService', () => {
  let service: BillingAccountsService;

  beforeEach(() => {
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
});
