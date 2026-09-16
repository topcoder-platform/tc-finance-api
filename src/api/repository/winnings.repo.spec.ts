import { DateFilterType } from 'src/dto/date-filter.type';
import { PaymentStatus } from 'src/dto/payment.dto';
import { payment, Prisma } from '@prisma/client';

jest.mock('src/shared/global', () => ({
  Logger: class {
    debug = jest.fn();

    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

import { WinningsRepository } from './winnings.repo';

/**
 * Builds a historical winning for repository read regressions.
 * @param installments Overrides for each current payment installment.
 * @returns A Prisma-shaped winning with the supplied payment rows.
 * @throws This fixture does not throw for valid payment overrides.
 */
function splitWinning(installments: Partial<payment>[]) {
  const createdAt = new Date('2024-02-27T21:15:17.000Z');
  return {
    winning_id: 'winning-split',
    winner_id: '90221384',
    type: 'PAYMENT',
    category: 'TASK_PAYMENT',
    title: 'TaaS payment',
    description: 'Week ending 2/10/2024',
    external_id: 'challenge-split',
    attributes: {},
    created_at: createdAt,
    payment: installments.map((overrides, index) => ({
      payment_id: `installment-${index + 1}`,
      installment_number: index + 1,
      gross_amount: new Prisma.Decimal(0),
      net_amount: new Prisma.Decimal(0),
      total_amount: new Prisma.Decimal(3680),
      currency: 'USD',
      payment_status: 'PAID',
      version: 4,
      created_at: createdAt,
      updated_at: createdAt,
      date_paid: new Date('2024-03-20T14:19:07.000Z'),
      ...overrides,
    })),
  };
}

describe('WinningsRepository', () => {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let findManyMock: jest.Mock;
  let winningsRepo: WinningsRepository;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-10-24T03:20:35.000Z'));

    findManyMock = jest.fn().mockResolvedValue([]);

    const prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      winnings: {
        findMany: findManyMock,
      },
    };

    winningsRepo = new WinningsRepository(prismaMock as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function getSearchWhere(
    searchProps: Record<string, unknown>,
  ): Promise<any> {
    await winningsRepo.searchWinnings(searchProps, {
      includeCount: false,
      includePayoutStatus: false,
    });

    const calls = findManyMock.mock.calls;
    return calls[calls.length - 1]?.[0]?.where;
  }

  async function getCreatedAtFilter(date: DateFilterType): Promise<any> {
    const where = await getSearchWhere({ date });

    return where.created_at;
  }

  it('applies an inclusive 7-day range ending today for LAST7DAYS', async () => {
    const createdAtFilter = await getCreatedAtFilter(DateFilterType.LAST7DAYS);

    expect(createdAtFilter).toEqual({
      gte: expect.any(Date),
      lte: expect.any(Date),
    });

    expect(createdAtFilter.lte.getHours()).toBe(23);
    expect(createdAtFilter.lte.getMinutes()).toBe(59);
    expect(createdAtFilter.lte.getSeconds()).toBe(59);
    expect(createdAtFilter.lte.getMilliseconds()).toBe(999);
    expect(createdAtFilter.lte.getTime() - createdAtFilter.gte.getTime()).toBe(
      7 * ONE_DAY - 1,
    );
  });

  it('applies an inclusive 30-day range ending today for LAST30DAYS', async () => {
    const createdAtFilter = await getCreatedAtFilter(DateFilterType.LAST30DAYS);

    expect(createdAtFilter).toEqual({
      gte: expect.any(Date),
      lte: expect.any(Date),
    });

    expect(createdAtFilter.lte.getHours()).toBe(23);
    expect(createdAtFilter.lte.getMinutes()).toBe(59);
    expect(createdAtFilter.lte.getSeconds()).toBe(59);
    expect(createdAtFilter.lte.getMilliseconds()).toBe(999);
    expect(createdAtFilter.lte.getTime() - createdAtFilter.gte.getTime()).toBe(
      30 * ONE_DAY - 1,
    );
  });

  it('does not apply created_at bounds for ALL', async () => {
    const createdAtFilter = await getCreatedAtFilter(DateFilterType.ALL);

    expect(createdAtFilter).toBeUndefined();
  });

  it('applies inclusive created_at bounds for dateFrom and dateTo', async () => {
    const where = await getSearchWhere({
      dateFrom: '2026-04-30',
      dateTo: '2026-05-25',
    });
    const createdAtFilter = where.created_at;

    expect(createdAtFilter.gte.getFullYear()).toBe(2026);
    expect(createdAtFilter.gte.getMonth()).toBe(3);
    expect(createdAtFilter.gte.getDate()).toBe(30);
    expect(createdAtFilter.gte.getHours()).toBe(0);
    expect(createdAtFilter.lte.getFullYear()).toBe(2026);
    expect(createdAtFilter.lte.getMonth()).toBe(4);
    expect(createdAtFilter.lte.getDate()).toBe(25);
    expect(createdAtFilter.lte.getHours()).toBe(23);
    expect(createdAtFilter.lte.getMinutes()).toBe(59);
    expect(createdAtFilter.lte.getSeconds()).toBe(59);
    expect(createdAtFilter.lte.getMilliseconds()).toBe(999);
  });

  it('prefers explicit dateFrom/dateTo over preset date filters', async () => {
    const where = await getSearchWhere({
      date: DateFilterType.LAST7DAYS,
      dateFrom: '2026-04-30',
      dateTo: '2026-05-25',
    });

    expect(where.created_at.gte.getFullYear()).toBe(2026);
    expect(where.created_at.gte.getMonth()).toBe(3);
    expect(where.created_at.gte.getDate()).toBe(30);
    expect(where.created_at.lte.getDate()).toBe(25);
  });

  it('filters by multiple payment statuses', async () => {
    const where = await getSearchWhere({
      status: [PaymentStatus.ON_HOLD_ADMIN, PaymentStatus.PAID],
    });

    expect(where.payment.some.payment_status).toEqual({
      in: [PaymentStatus.ON_HOLD_ADMIN, PaymentStatus.PAID],
    });
  });

  it('filters by a single payment status', async () => {
    const where = await getSearchWhere({
      status: PaymentStatus.OWED,
    });

    expect(where.payment.some.payment_status).toEqual({
      equals: PaymentStatus.OWED,
    });
  });

  it('filters getWinningsByExternalId by external_id instead of winner_id', async () => {
    await winningsRepo.getWinningsByExternalId('ext-123');

    const findManyArgs = findManyMock.mock.calls[0][0];

    expect(findManyArgs.where.external_id).toEqual({
      in: ['ext-123'],
    });
    expect(findManyArgs.where.winner_id).toBeUndefined();
  });

  it.each(['search', 'external-id'])(
    'returns both paid installments and a $3,680 gross total through %s',
    async (endpoint) => {
      findManyMock.mockResolvedValueOnce([
        splitWinning([
          { gross_amount: new Prisma.Decimal(2760) },
          { gross_amount: new Prisma.Decimal(920) },
        ]),
      ]);

      const result =
        endpoint === 'search'
          ? await winningsRepo.searchWinnings(
              {},
              { includeCount: false, includePayoutStatus: false },
            )
          : await winningsRepo.getWinningsByExternalId('challenge-split');
      expect(result.error).toBeUndefined();
      const winning = Array.isArray(result.data)
        ? result.data[0]
        : result.data?.winnings[0];

      expect(winning?.grossAmount).toBe(3680);
      expect(winning?.details).toEqual([
        expect.objectContaining({
          installmentNumber: 1,
          grossAmount: 2760,
          totalAmount: 3680,
          status: PaymentStatus.PAID,
        }),
        expect.objectContaining({
          installmentNumber: 2,
          grossAmount: 920,
          totalAmount: 3680,
          status: PaymentStatus.PAID,
        }),
      ]);

      // Include every current installment without restricting the whole winning
      // to one row or deduplicating independent payments sharing a number.
      const paymentQuery = findManyMock.mock.calls[0][0].include.payment;
      expect(paymentQuery).toEqual({
        where: { installment_number: { gte: 1 } },
        orderBy: [
          { installment_number: 'asc' },
          { created_at: 'desc' },
          { payment_id: 'asc' },
        ],
      });
    },
  );

  it('preserves a single installment gross amount without adding billing markup', async () => {
    findManyMock.mockResolvedValueOnce([
      splitWinning([
        {
          gross_amount: new Prisma.Decimal('544.99'),
          total_amount: new Prisma.Decimal('931.93'),
          challenge_fee: new Prisma.Decimal('386.94'),
        },
      ]),
    ]);

    const result =
      await winningsRepo.getWinningsByExternalId('challenge-split');

    expect(result.error).toBeUndefined();
    expect(result.data?.[0].grossAmount).toBe(544.99);
    expect(result.data?.[0].details[0].totalAmount).toBe(931.93);
  });

  it('preserves independent payment rows sharing an installment number and differing versions', async () => {
    findManyMock.mockResolvedValueOnce([
      splitWinning([
        {
          installment_number: 1,
          version: 1,
          gross_amount: new Prisma.Decimal(100),
        },
        {
          installment_number: 1,
          version: 9,
          gross_amount: new Prisma.Decimal(50),
        },
        {
          installment_number: 2,
          version: 2,
          gross_amount: new Prisma.Decimal('0.10'),
        },
      ]),
    ]);

    const result =
      await winningsRepo.getWinningsByExternalId('challenge-split');

    expect(result.error).toBeUndefined();
    expect(result.data?.[0].grossAmount).toBe(150.1);
    expect(result.data?.[0].details.map((detail) => detail.id)).toEqual([
      'installment-1',
      'installment-2',
      'installment-3',
    ]);
  });

  it('totals decimal amounts exactly while retaining mixed installment statuses', async () => {
    findManyMock.mockResolvedValueOnce([
      splitWinning([
        { gross_amount: new Prisma.Decimal('0.10'), payment_status: 'PAID' },
        { gross_amount: new Prisma.Decimal('0.20'), payment_status: 'OWED' },
        { gross_amount: null, payment_status: 'CANCELLED' },
      ]),
    ]);

    const result =
      await winningsRepo.getWinningsByExternalId('challenge-split');

    expect(result.error).toBeUndefined();
    expect(result.data?.[0].grossAmount).toBe(0.3);
    expect(result.data?.[0].details.map((detail) => detail.status)).toEqual([
      PaymentStatus.PAID,
      PaymentStatus.OWED,
      PaymentStatus.CANCELLED,
    ]);
  });

  it('returns persisted challenge fee and markup for external-id payment history', async () => {
    const createdAt = new Date('2026-06-15T13:28:18.662Z');

    findManyMock.mockResolvedValueOnce([
      {
        attributes: {},
        category: 'ENGAGEMENT_PAYMENT',
        created_at: createdAt,
        description: 'Wipro - UHG - Power BI resources',
        external_id: 'assignment-1',
        origin: {
          origin_name: 'Topcoder',
        },
        payment: [
          {
            billing_account: '80004405',
            challenge_fee: 386.94,
            challenge_markup: 0.71,
            currency: 'USD',
            date_paid: createdAt,
            gross_amount: 544.99,
            installment_number: 1,
            net_amount: 0,
            payment_id: '8fbb836d-3d6b-4e19-a4cc-871e0e1bc12d',
            payment_status: 'PAID',
            release_date: createdAt,
            total_amount: 544.99,
            updated_at: createdAt,
          },
        ],
        title: 'Wipro - UHG - Power BI resources',
        type: 'PAYMENT',
        updated_at: createdAt,
        winner_id: '500013447',
        winning_id: 'winning-1',
      },
    ]);

    const result = await winningsRepo.getWinningsByExternalId('assignment-1');

    expect(result.data?.[0].details[0]).toMatchObject({
      billingAccount: '80004405',
      challengeFee: 386.94,
      challengeMarkup: 0.71,
      totalAmount: 544.99,
    });
  });
});
