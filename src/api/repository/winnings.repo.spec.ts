import { DateFilterType } from 'src/dto/date-filter.type';

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

  async function getCreatedAtFilter(date: DateFilterType): Promise<any> {
    await winningsRepo.searchWinnings(
      {
        date,
      } as any,
      {
        includeCount: false,
        includePayoutStatus: false,
      },
    );

    const findManyArgs = findManyMock.mock.calls[0][0];
    return findManyArgs.where.created_at;
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
});
