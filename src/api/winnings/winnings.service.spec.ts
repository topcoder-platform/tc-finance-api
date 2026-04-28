jest.mock('src/config', () => ({
  ENV_CONFIG: {
    SENDGRID_TEMPLATE_ID_PAYMENT_SETUP_NOTIFICATION: 'template-id',
    TGBillingAccounts: [80000062, 80002800],
    TOPCODER_WALLET_URL: 'https://wallet.topcoder.com',
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

import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CHALLENGE_BUDGET_SYNC_SKIP_ATTRIBUTE,
  WinningsService,
} from './winnings.service';
import { PrizeType } from '../challenges/models';
import { WinningsCategory, WinningsType } from 'src/dto/winning.dto';

interface TestTransactionClient {
  payment: {
    findMany: jest.Mock;
  };
  winnings: {
    create: jest.Mock;
  };
}

type TransactionCallback = (
  transactionClient: TestTransactionClient,
) => Promise<unknown>;

describe('WinningsService', () => {
  let service: WinningsService;
  let tx: TestTransactionClient;
  let prisma: {
    $transaction: jest.Mock<Promise<unknown>, [TransactionCallback]>;
  };
  let billingAccountsService: {
    consumeAmounts: jest.Mock;
    getBillingAccountById: jest.Mock;
    lockConsumeAmount: jest.Mock;
  };
  let topcoderChallengesService: {
    getChallengeById: jest.Mock;
  };
  let topcoderEngagementsService: {
    getAssignmentContextById: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      winnings: {
        create: jest.fn().mockResolvedValue({ winning_id: 'winning-1' }),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: TransactionCallback) => {
        const transactionResult = await callback(tx);

        return transactionResult;
      }),
    };
    billingAccountsService = {
      consumeAmounts: jest.fn().mockResolvedValue({ count: 1 }),
      getBillingAccountById: jest
        .fn()
        .mockResolvedValue({ id: 123456, markup: 0.2 }),
      lockConsumeAmount: jest.fn().mockResolvedValue(undefined),
    };
    topcoderChallengesService = {
      getChallengeById: jest.fn().mockResolvedValue(undefined),
    };
    topcoderEngagementsService = {
      getAssignmentContextById: jest.fn().mockResolvedValue({
        assignmentId: 'assignment-1',
        billingAccountId: 123456,
      }),
    };

    service = new WinningsService(
      prisma as any,
      { hasActiveTaxForm: jest.fn().mockResolvedValue(true) } as any,
      { getConnectedPaymentMethod: jest.fn().mockResolvedValue({}) } as any,
      { getOriginIdByName: jest.fn().mockResolvedValue(1) } as any,
      {} as any,
      {
        completedIdentityVerification: jest.fn().mockResolvedValue(true),
      } as any,
      {} as any,
      topcoderChallengesService as any,
      topcoderEngagementsService as any,
      billingAccountsService as any,
    );
  });

  it('validates the trusted engagement billing account and consumes in one batch', async () => {
    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.ENGAGEMENT_PAYMENT,
        title: 'Engagement work',
        description: 'Engagement payment',
        externalId: 'assignment-1',
        attributes: {
          assignmentId: 'assignment-1',
        },
        details: [
          {
            totalAmount: 100,
            grossAmount: 100,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
          {
            totalAmount: 50,
            grossAmount: 50,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
          {
            totalAmount: 0.1,
            grossAmount: 0.1,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
        ],
      } as any,
      'creator-1',
    );

    const persistedPayments =
      tx.winnings.create.mock.calls[0][0].data.payment.create;

    expect(
      topcoderEngagementsService.getAssignmentContextById,
    ).toHaveBeenCalledWith('assignment-1');
    expect(billingAccountsService.getBillingAccountById).toHaveBeenCalledTimes(
      1,
    );
    expect(billingAccountsService.getBillingAccountById).toHaveBeenCalledWith(
      123456,
    );
    expect(billingAccountsService.consumeAmounts).toHaveBeenCalledTimes(1);
    expect(billingAccountsService.consumeAmounts).toHaveBeenCalledWith({
      consumes: [
        {
          amount: 120,
          billingAccountId: 123456,
          externalId: 'assignment-1',
          externalType: 'ENGAGEMENT',
        },
        {
          amount: 60,
          billingAccountId: 123456,
          externalId: 'assignment-1',
          externalType: 'ENGAGEMENT',
        },
        {
          amount: 0.12,
          billingAccountId: 123456,
          externalId: 'assignment-1',
          externalType: 'ENGAGEMENT',
        },
      ],
    });
    expect(
      persistedPayments.map((payment: any) => ({
        billingAccount: payment.billing_account,
        challengeFee: Number(payment.challenge_fee),
        challengeMarkup: Number(payment.challenge_markup),
      })),
    ).toEqual([
      {
        billingAccount: '123456',
        challengeFee: 20,
        challengeMarkup: 0.2,
      },
      {
        billingAccount: '123456',
        challengeFee: 10,
        challengeMarkup: 0.2,
      },
      {
        billingAccount: '123456',
        challengeFee: 0.02,
        challengeMarkup: 0.2,
      },
    ]);
  });

  it('rounds engagement challenge markup before persisting the payment fee', async () => {
    billingAccountsService.getBillingAccountById.mockResolvedValue({
      id: 123456,
      markup: 0.236,
    });

    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.ENGAGEMENT_PAYMENT,
        title: 'Engagement work',
        description: 'Engagement payment',
        externalId: 'assignment-1',
        details: [
          {
            totalAmount: 100,
            grossAmount: 100,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
        ],
      } as any,
      'creator-1',
    );

    const persistedPayment =
      tx.winnings.create.mock.calls[0][0].data.payment.create[0];

    expect(Number(persistedPayment.challenge_markup)).toBe(0.24);
    expect(Number(persistedPayment.challenge_fee)).toBe(24);
    expect(billingAccountsService.consumeAmounts).toHaveBeenCalledWith({
      consumes: [
        {
          amount: 124,
          billingAccountId: 123456,
          externalId: 'assignment-1',
          externalType: 'ENGAGEMENT',
        },
      ],
    });
  });

  it('rejects engagement payment details that do not match the assignment billing account', async () => {
    await expect(
      service.createWinningWithPayments(
        {
          winnerId: 'user-1',
          type: WinningsType.PAYMENT,
          origin: 'Topcoder',
          category: WinningsCategory.ENGAGEMENT_PAYMENT,
          title: 'Engagement work',
          description: 'Engagement payment',
          externalId: 'assignment-1',
          attributes: {
            assignmentId: 'assignment-1',
          },
          details: [
            {
              totalAmount: 100,
              grossAmount: 100,
              installmentNumber: 1,
              currency: PrizeType.USD,
              billingAccount: '999999',
            },
          ],
        } as any,
        'creator-1',
      ),
    ).rejects.toThrow(
      'details[0].billingAccount does not match the assignment billing account',
    );

    expect(billingAccountsService.getBillingAccountById).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
  });

  it('maps a configured assignment without billing account to BadRequestException', async () => {
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      billingAccountId: null,
    });

    await expect(
      service.createWinningWithPayments(
        {
          winnerId: 'user-1',
          type: WinningsType.PAYMENT,
          origin: 'Topcoder',
          category: WinningsCategory.ENGAGEMENT_PAYMENT,
          title: 'Engagement work',
          description: 'Engagement payment',
          externalId: 'assignment-1',
          details: [
            {
              totalAmount: 100,
              grossAmount: 100,
              installmentNumber: 1,
              currency: PrizeType.USD,
              billingAccount: '123456',
            },
          ],
        } as any,
        'creator-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(billingAccountsService.getBillingAccountById).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
  });

  it('maps malformed assignment billing account context to InternalServerErrorException', async () => {
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      billingAccountId: 'not-a-number',
    });

    await expect(
      service.createWinningWithPayments(
        {
          winnerId: 'user-1',
          type: WinningsType.PAYMENT,
          origin: 'Topcoder',
          category: WinningsCategory.ENGAGEMENT_PAYMENT,
          title: 'Engagement work',
          description: 'Engagement payment',
          externalId: 'assignment-1',
          details: [
            {
              totalAmount: 100,
              grossAmount: 100,
              installmentNumber: 1,
              currency: PrizeType.USD,
              billingAccount: '123456',
            },
          ],
        } as any,
        'creator-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(billingAccountsService.getBillingAccountById).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
  });

  it('maps assignment-context lookup failures to InternalServerErrorException', async () => {
    topcoderEngagementsService.getAssignmentContextById.mockRejectedValue(
      new Error('engagements lookup failed'),
    );

    await expect(
      service.createWinningWithPayments(
        {
          winnerId: 'user-1',
          type: WinningsType.PAYMENT,
          origin: 'Topcoder',
          category: WinningsCategory.ENGAGEMENT_PAYMENT,
          title: 'Engagement work',
          description: 'Engagement payment',
          externalId: 'assignment-1',
          details: [
            {
              totalAmount: 100,
              grossAmount: 100,
              installmentNumber: 1,
              currency: PrizeType.USD,
              billingAccount: '123456',
            },
          ],
        } as any,
        'creator-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(billingAccountsService.getBillingAccountById).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
  });

  it('skips engagement billing-account consume for trusted TopGear accounts', async () => {
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      billingAccountId: 80000062,
    });
    billingAccountsService.getBillingAccountById.mockResolvedValue({
      id: 80000062,
      markup: 0.2,
    });

    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.ENGAGEMENT_PAYMENT,
        title: 'Engagement work',
        description: 'Engagement payment',
        externalId: 'assignment-1',
        attributes: {
          assignmentId: 'assignment-1',
        },
        details: [
          {
            totalAmount: 100,
            grossAmount: 100,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '80000062',
          },
        ],
      } as any,
      'creator-1',
    );

    const persistedPayment =
      tx.winnings.create.mock.calls[0][0].data.payment.create[0];

    expect(billingAccountsService.getBillingAccountById).toHaveBeenCalledTimes(
      1,
    );
    expect(billingAccountsService.getBillingAccountById).toHaveBeenCalledWith(
      80000062,
    );
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
    expect(Number(persistedPayment.challenge_markup)).toBe(0.2);
    expect(Number(persistedPayment.challenge_fee)).toBe(20);
  });

  it('locks the aggregate billing-account amount for draft challenge payments', async () => {
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      billing: {
        markup: 0.2,
      },
      id: 'challenge-id',
      status: 'DRAFT',
    });
    tx.payment.findMany.mockResolvedValue([
      { total_amount: '100.00' },
      { total_amount: '50.25' },
    ]);

    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.CONTEST_PAYMENT,
        title: 'Draft challenge payment',
        description: 'Draft challenge payment',
        externalId: 'challenge-id',
        details: [
          {
            totalAmount: 100,
            grossAmount: 100,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '80001012',
          },
        ],
      } as any,
      'creator-1',
    );

    expect(topcoderChallengesService.getChallengeById).toHaveBeenCalledWith(
      'challenge-id',
    );
    expect(tx.payment.findMany).toHaveBeenCalledWith({
      select: { total_amount: true },
      where: {
        billing_account: '80001012',
        currency: PrizeType.USD,
        payment_status: { not: 'CANCELLED' },
        winnings: {
          external_id: 'challenge-id',
          type: 'PAYMENT',
        },
      },
    });
    expect(billingAccountsService.lockConsumeAmount).toHaveBeenCalledWith({
      billingAccountId: 80001012,
      challengeId: 'challenge-id',
      markup: 0.2,
      status: 'DRAFT',
      totalPrizesInCents: 15025,
    });
  });

  it('skips per-winning billing sync for generated challenge payment batches', async () => {
    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.CONTEST_PAYMENT,
        title: 'Generated challenge payment',
        description: 'Generated challenge payment',
        externalId: 'challenge-id',
        attributes: {
          billingAccountId: '80001012',
          [CHALLENGE_BUDGET_SYNC_SKIP_ATTRIBUTE]: true,
        },
        details: [
          {
            totalAmount: 100,
            grossAmount: 100,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '80001012',
          },
        ],
      } as any,
      'creator-1',
    );

    expect(topcoderChallengesService.getChallengeById).not.toHaveBeenCalled();
    expect(billingAccountsService.lockConsumeAmount).not.toHaveBeenCalled();
    expect(tx.winnings.create.mock.calls[0][0].data.attributes).toEqual({
      billingAccountId: '80001012',
    });
  });
});
