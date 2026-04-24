jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

import { winnings_category } from '@prisma/client';
import { Role } from 'src/core/auth/auth.constants';
import { PaymentApproverProvider } from './payment-approver.provider';

describe('PaymentApproverProvider', () => {
  let provider: PaymentApproverProvider;
  let prisma: {
    winnings: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      winnings: {
        findMany: jest.fn(),
      },
    };

    provider = new PaymentApproverProvider(prisma as any);
  });

  it('replaces incoming category filters with allowed payment approver categories', async () => {
    const result = await provider.applyFilter<Record<string, unknown>>(
      '123456',
      {
        categories: [winnings_category.ALGORITHM_CONTEST_PAYMENT],
        category: winnings_category.ALGORITHM_CONTEST_PAYMENT,
        limit: 10,
        type: 'PAYMENT',
      },
    );

    expect(result).toEqual({
      categories: [
        winnings_category.ENGAGEMENT_PAYMENT,
        winnings_category.TASK_PAYMENT,
      ],
      limit: 10,
      type: 'PAYMENT',
    });
    expect(result).not.toHaveProperty('category');
  });

  it('allows access when all winnings are approver-allowed categories', async () => {
    prisma.winnings.findMany.mockResolvedValue([
      { category: winnings_category.ENGAGEMENT_PAYMENT },
      { category: winnings_category.TASK_PAYMENT },
    ]);

    await expect(
      provider.verifyAccessToResource(['winning-1', 'winning-2'], '123456'),
    ).resolves.toBeUndefined();

    expect(prisma.winnings.findMany).toHaveBeenCalledWith({
      where: { winning_id: { in: ['winning-1', 'winning-2'] } },
      select: { category: true },
    });
  });

  it('rejects access when any winning is outside the allowed categories', async () => {
    prisma.winnings.findMany.mockResolvedValue([
      { category: winnings_category.ENGAGEMENT_PAYMENT },
      { category: winnings_category.ALGORITHM_CONTEST_PAYMENT },
    ]);

    await expect(
      provider.verifyAccessToResource('winning-1', '123456'),
    ).rejects.toThrow(
      `${Role.PaymentApprover} user is trying to access winning with category='${winnings_category.ALGORITHM_CONTEST_PAYMENT}'`,
    );

    expect(prisma.winnings.findMany).toHaveBeenCalledWith({
      where: { winning_id: { in: ['winning-1'] } },
      select: { category: true },
    });
  });
});
