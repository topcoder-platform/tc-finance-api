jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

import { DuplicatePaymentsService } from './duplicate-payments.service';

describe('DuplicatePaymentsService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: DuplicatePaymentsService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new DuplicatePaymentsService(prisma as any);
  });

  const lastQuery = (client: { $queryRaw: jest.Mock }) => {
    const [strings, ...values] = client.$queryRaw.mock.calls[0];
    return { sql: (strings as string[]).join('?'), values };
  };

  it('ignores FAILED and RETURNED releases and reports each pair once', async () => {
    await service.findDuplicateReleases();

    const { sql } = lastQuery(prisma);
    expect(sql).toContain(
      "COALESCE(r1.status, '') NOT IN ('FAILED', 'RETURNED')",
    );
    expect(sql).toContain(
      "COALESCE(r2.status, '') NOT IN ('FAILED', 'RETURNED')",
    );
    expect(sql).toContain(
      '(r1.created_at, r1.payment_release_id) < (r2.created_at, r2.payment_release_id)',
    );
  });

  it('searches the whole history when no date is given', async () => {
    await service.findDuplicateReleases();

    const sinceFilter = lastQuery(prisma).values.at(-1);
    expect(sinceFilter.sql).toBe('');
  });

  it('filters on the newer release creation date when a date is given', async () => {
    const since = new Date('2026-10-01T00:00:00Z');

    await service.findDuplicateReleases({ since });

    const sinceFilter = lastQuery(prisma).values.at(-1);
    expect(sinceFilter.sql).toBe('AND r2.created_at >= ?');
    expect(sinceFilter.values).toEqual([since]);
  });

  it('runs on the given transaction client', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };

    await service.findDuplicateReleases({}, tx as any);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
