import { DateFilterType } from 'src/dto/date-filter.type';
import { PaymentStatus } from 'src/dto/payment.dto';

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

describe('WinningsRepository', () => {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let findManyMock: jest.Mock;
  let winningsRepo: WinningsRepository;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-10-24T03:20:35.000Z'));

    findManyMock = jest.fn().mockResolvedValue([]);

    const prismaMock = {
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
    await winningsRepo.searchWinnings(searchProps as any, {
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
});
