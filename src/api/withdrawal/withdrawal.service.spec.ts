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
    TROLLEY_MINIMUM_PAYMENT_AMOUNT: 1,
  },
}));

import { WithdrawalService } from './withdrawal.service';

const WINNINGS_IDS = ['w-1', 'w-2'];

const releasableRows = () => [
  {
    paymentId: 'p-1',
    amount: '100',
    version: 1,
    title: 'Payment 1',
    externalId: 'e-1',
    status: 'OWED',
    type: 'PAYMENT',
    releaseDate: new Date(Date.now() - 1000),
    datePaid: null,
    currency: 'USD',
  },
  {
    paymentId: 'p-2',
    amount: '50',
    version: 1,
    title: 'Payment 2',
    externalId: 'e-2',
    status: 'OWED',
    type: 'PAYMENT',
    releaseDate: new Date(Date.now() - 1000),
    datePaid: null,
    currency: 'USD',
  },
];

describe('WithdrawalService.withdraw', () => {
  let calls: string[];
  let tx: any;
  let prisma: any;
  let paymentsService: any;
  let trolleyService: any;
  let service: WithdrawalService;

  const withdraw = () =>
    service.withdraw('123', 'handle', WINNINGS_IDS, undefined, '000000');

  beforeEach(() => {
    calls = [];

    tx = {
      $queryRaw: jest.fn().mockImplementation(() => {
        calls.push('tx.lockWinnings');
        return Promise.resolve(releasableRows());
      }),
      payment_releases: {
        create: jest.fn().mockImplementation(() => {
          calls.push('tx.createRelease');
          return Promise.resolve({ payment_release_id: 'release-1' });
        }),
      },
    };

    prisma = {
      $queryRaw: jest.fn().mockResolvedValue(releasableRows()),
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (client: any) => Promise<unknown>) => {
          calls.push('tx.begin');
          const result = await cb(tx);
          calls.push('tx.commit');
          return result;
        }),
      trolley_recipient: {
        findUnique: jest.fn().mockResolvedValue({ trolley_id: 'R-1' }),
      },
      payment_releases: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    paymentsService = {
      claimOwedPayments: jest.fn().mockImplementation(() => {
        calls.push('tx.claim');
        return Promise.resolve();
      }),
      revertClaimedPayments: jest.fn().mockResolvedValue(undefined),
    };

    trolleyService = {
      getRecipientPayoutDetails: jest
        .fn()
        .mockResolvedValue({ payoutMethod: 'bank-transfer' }),
      startBatchPayment: jest.fn().mockImplementation(() => {
        calls.push('trolley.batch');
        return Promise.resolve({ id: 'B-1' });
      }),
      createPayment: jest.fn().mockImplementation(() => {
        calls.push('trolley.payment');
        return Promise.resolve({ id: 'P-1' });
      }),
      removePayment: jest.fn().mockResolvedValue(undefined),
      startProcessingPayment: jest.fn().mockResolvedValue(undefined),
    };

    service = new WithdrawalService(
      prisma,
      { hasActiveTaxForm: jest.fn().mockResolvedValue(true) } as any,
      paymentsService,
      {
        getConnectedPaymentMethod: jest
          .fn()
          .mockResolvedValue({ payment_method_id: 1 }),
      } as any,
      {
        completedIdentityVerification: jest.fn().mockResolvedValue(true),
      } as any,
      trolleyService,
      {} as any,
      {
        getMemberInfoByUserHandle: jest
          .fn()
          .mockResolvedValue({ email: 'member@example.com' }),
      } as any,
      {
        verifyOtpCode: jest.fn().mockResolvedValue({ code: 'success' }),
      } as any,
    );
  });

  it('claims the payments and creates the release in one transaction before calling trolley', async () => {
    await withdraw();

    expect(calls).toEqual([
      'tx.begin',
      'tx.lockWinnings',
      'tx.claim',
      'tx.createRelease',
      'tx.commit',
      'trolley.batch',
      'trolley.payment',
    ]);
    expect(paymentsService.claimOwedPayments).toHaveBeenCalledWith(
      WINNINGS_IDS,
      tx,
    );

    const lockClause = tx.$queryRaw.mock.calls[0].at(-1);
    expect(lockClause.sql).toBe('FOR UPDATE OF p NOWAIT');
    expect(trolleyService.createPayment).toHaveBeenCalledWith(
      'R-1',
      'B-1',
      150,
      'release-1',
      undefined,
    );
    expect(trolleyService.startProcessingPayment).toHaveBeenCalledWith('B-1');
  });

  it('does not lock rows in the pre-otp validation read', async () => {
    await withdraw();

    const lockClause = prisma.$queryRaw.mock.calls[0].at(-1);
    expect(lockClause.sql).toBe('');
  });

  it('rejects a repeated withdrawal once the payments are already claimed', async () => {
    paymentsService.claimOwedPayments.mockRejectedValueOnce(
      new Error('Failed to claim payments'),
    );

    await expect(withdraw()).rejects.toThrow('Failed to claim payments');

    expect(tx.payment_releases.create).not.toHaveBeenCalled();
    expect(trolleyService.startBatchPayment).not.toHaveBeenCalled();
    expect(trolleyService.createPayment).not.toHaveBeenCalled();
  });

  it('rejects a concurrent withdrawal that hits the row lock', async () => {
    tx.$queryRaw.mockRejectedValueOnce(
      Object.assign(new Error('could not obtain lock'), {
        code: 'P2010',
        meta: { code: '55P03' },
      }),
    );

    await expect(withdraw()).rejects.toThrow(
      'Some or all of the winnings you requested to process are either processing, on hold or already paid.',
    );

    expect(paymentsService.claimOwedPayments).not.toHaveBeenCalled();
    expect(trolleyService.createPayment).not.toHaveBeenCalled();
  });

  it('rolls back the claim when the trolley payment cannot be created', async () => {
    trolleyService.createPayment.mockRejectedValueOnce(
      new Error('Trolley down'),
    );

    await expect(withdraw()).rejects.toThrow('Trolley down');

    expect(prisma.payment_releases.update).toHaveBeenCalledWith({
      where: { payment_release_id: 'release-1' },
      data: { external_transaction_id: undefined, status: 'FAILED' },
    });
    expect(paymentsService.revertClaimedPayments).toHaveBeenCalledWith(
      WINNINGS_IDS,
      'OWED',
    );
    expect(trolleyService.removePayment).not.toHaveBeenCalled();
    expect(trolleyService.startProcessingPayment).not.toHaveBeenCalled();
  });

  it('removes the trolley payment and rolls back when saving its id fails', async () => {
    prisma.payment_releases.update.mockRejectedValueOnce(new Error('db down'));

    await expect(withdraw()).rejects.toThrow('db down');

    expect(trolleyService.removePayment).toHaveBeenCalledWith('P-1', 'B-1');
    expect(paymentsService.revertClaimedPayments).toHaveBeenCalledWith(
      WINNINGS_IDS,
      'OWED',
    );
    expect(trolleyService.startProcessingPayment).not.toHaveBeenCalled();
  });

  it('marks the payments as FAILED and keeps the release PROCESSING when the trolley batch cannot be processed', async () => {
    trolleyService.startProcessingPayment.mockRejectedValueOnce(
      new Error('batch failed'),
    );

    await expect(withdraw()).rejects.toThrow(
      'Failed to release payment: batch failed',
    );

    // only the trolley payment id was saved; the release status is untouched
    expect(prisma.payment_releases.update).toHaveBeenCalledTimes(1);
    expect(prisma.payment_releases.update).toHaveBeenCalledWith({
      where: { payment_release_id: 'release-1' },
      data: { external_transaction_id: 'P-1', status: undefined },
    });
    expect(paymentsService.revertClaimedPayments).toHaveBeenCalledTimes(1);
    expect(paymentsService.revertClaimedPayments).toHaveBeenCalledWith(
      WINNINGS_IDS,
      'FAILED',
    );
  });
});
