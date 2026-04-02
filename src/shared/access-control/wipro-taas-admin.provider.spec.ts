jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

import { winnings_category } from '@prisma/client';
import { Role } from 'src/core/auth/auth.constants';
import { WiproTaasAdminProvider } from './wipro-taas-admin.provider';

describe('WiproTaasAdminProvider', () => {
  let provider: WiproTaasAdminProvider;
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

    provider = new WiproTaasAdminProvider(prisma as any);
  });

  it('applies TAAS payment category filter', async () => {
    const result = await provider.applyFilter<Record<string, unknown>>(
      '123456',
      {
        limit: 10,
        type: 'PAYMENT',
      },
    );

    expect(result).toEqual({
      category: winnings_category.TAAS_PAYMENT,
      limit: 10,
      type: 'PAYMENT',
    });
  });

  it('allows access when all winnings are TAAS payments', async () => {
    prisma.winnings.findMany.mockResolvedValue([
      { category: winnings_category.TAAS_PAYMENT },
      { category: winnings_category.TAAS_PAYMENT },
    ]);

    await expect(
      provider.verifyAccessToResource(['winning-1', 'winning-2'], '123456'),
    ).resolves.toBeUndefined();

    expect(prisma.winnings.findMany).toHaveBeenCalledWith({
      where: { winning_id: { in: ['winning-1', 'winning-2'] } },
      select: { category: true },
    });
  });

  it('rejects access when any winning is not a TAAS payment', async () => {
    prisma.winnings.findMany.mockResolvedValue([
      { category: winnings_category.TAAS_PAYMENT },
      { category: winnings_category.ENGAGEMENT_PAYMENT },
    ]);

    await expect(
      provider.verifyAccessToResource('winning-1', '123456'),
    ).rejects.toThrow(
      `${Role.WiproTaasAdmin} user is trying to access winning with category='${winnings_category.ENGAGEMENT_PAYMENT}'`,
    );

    expect(prisma.winnings.findMany).toHaveBeenCalledWith({
      where: { winning_id: { in: ['winning-1'] } },
      select: { category: true },
    });
  });
});