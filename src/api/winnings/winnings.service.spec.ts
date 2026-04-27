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
import { Prisma } from '@prisma/client';
import { WinningsService } from './winnings.service';
import { PrizeType } from '../challenges/models';
import { WinningsCategory, WinningsType } from 'src/dto/winning.dto';

interface TestTransactionClient {
  payment: {
    aggregate: jest.Mock;
  };
  winnings: {
    create: jest.Mock;
    findMany: jest.Mock;
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
    consumeAmount: jest.Mock;
    consumeAmounts: jest.Mock;
    getBillingAccountById: jest.Mock;
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
        aggregate: jest.fn().mockResolvedValue({
          _sum: { total_amount: new Prisma.Decimal(0) },
        }),
      },
      winnings: {
        create: jest.fn().mockResolvedValue({ winning_id: 'winning-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: TransactionCallback) => {
        const transactionResult = await callback(tx);

        return transactionResult;
      }),
    };
    billingAccountsService = {
      consumeAmount: jest.fn().mockResolvedValue({ id: 'consume-1' }),
      consumeAmounts: jest.fn().mockResolvedValue({ count: 1 }),
      getBillingAccountById: jest
        .fn()
        .mockResolvedValue({ id: 123456, markup: 0.2 }),
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
      topcoderEngagementsService as any,
      topcoderChallengesService as any,
      billingAccountsService as any,
    );
  });

  it('updates consumed challenge budget after creating a completed challenge payment', async () => {
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      id: 'challenge-1',
      name: 'Challenge One',
      status: 'COMPLETED',
      billing: {
        billingAccountId: '123456',
        markup: 0.2,
      },
    });
    tx.winnings.findMany.mockResolvedValue([
      { winning_id: 'existing-winning' },
      { winning_id: 'winning-1' },
    ]);
    tx.payment.aggregate.mockResolvedValue({
      _sum: { total_amount: new Prisma.Decimal(125) },
    });

    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.CONTEST_PAYMENT,
        title: 'Challenge payment',
        description: 'Manual challenge payment',
        externalId: 'challenge-1',
        details: [
          {
            totalAmount: 25,
            grossAmount: 25,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
        ],
      } as any,
      'creator-1',
    );

    expect(topcoderChallengesService.getChallengeById).toHaveBeenCalledWith(
      'challenge-1',
    );
    expect(tx.winnings.findMany).toHaveBeenCalledWith({
      where: {
        external_id: 'challenge-1',
        type: 'PAYMENT',
      },
      select: { winning_id: true },
    });
    expect(tx.payment.aggregate).toHaveBeenCalledWith({
      where: {
        billing_account: '123456',
        currency: PrizeType.USD,
        winnings_id: {
          in: ['existing-winning', 'winning-1'],
        },
      },
      _sum: { total_amount: true },
    });
    expect(billingAccountsService.consumeAmount).toHaveBeenCalledTimes(1);
    expect(billingAccountsService.consumeAmount).toHaveBeenCalledWith(123456, {
      amount: 150,
      challengeId: 'challenge-1',
    });
    expect(billingAccountsService.consumeAmounts).not.toHaveBeenCalled();
  });

  it('skips challenge budget consume for generated challenge payment callers', async () => {
    await service.createWinningWithPayments(
      {
        winnerId: 'user-1',
        type: WinningsType.PAYMENT,
        origin: 'Topcoder',
        category: WinningsCategory.CONTEST_PAYMENT,
        title: 'Challenge payment',
        description: 'Generated challenge payment',
        externalId: 'challenge-1',
        details: [
          {
            totalAmount: 25,
            grossAmount: 25,
            installmentNumber: 1,
            currency: PrizeType.USD,
            billingAccount: '123456',
          },
        ],
      } as any,
      'creator-1',
      { skipChallengeBudgetConsume: true },
    );

    expect(topcoderChallengesService.getChallengeById).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmount).not.toHaveBeenCalled();
  });

  it('rejects completed challenge payments with the wrong billing account', async () => {
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      id: 'challenge-1',
      name: 'Challenge One',
      status: 'COMPLETED',
      billing: {
        billingAccountId: '123456',
        markup: 0.2,
      },
    });

    await expect(
      service.createWinningWithPayments(
        {
          winnerId: 'user-1',
          type: WinningsType.PAYMENT,
          origin: 'Topcoder',
          category: WinningsCategory.CONTEST_PAYMENT,
          title: 'Challenge payment',
          description: 'Manual challenge payment',
          externalId: 'challenge-1',
          details: [
            {
              totalAmount: 25,
              grossAmount: 25,
              installmentNumber: 1,
              currency: PrizeType.USD,
              billingAccount: '999999',
            },
          ],
        } as any,
        'creator-1',
      ),
    ).rejects.toThrow(
      'details[0].billingAccount does not match the challenge billing account',
    );

    expect(tx.winnings.create).not.toHaveBeenCalled();
    expect(billingAccountsService.consumeAmount).not.toHaveBeenCalled();
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
});
