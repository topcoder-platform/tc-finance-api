jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

import { ActionLogService } from './action-log.service';

describe('ActionLogService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: ActionLogService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new ActionLogService(prisma as any);
  });

  const lastQuery = (client: { $queryRaw: jest.Mock }) => {
    const [strings, ...values] = client.$queryRaw.mock.calls[0];
    return { sql: (strings as string[]).join('?'), values };
  };

  it('lists audit entries made since the given date, newest first', async () => {
    const since = new Date('2026-08-18T00:00:00Z');

    await service.findActions(since);

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain('FROM audit a');
    expect(sql).toContain('WHERE a.created_at >= ?');
    expect(sql).toContain('ORDER BY a.created_at DESC');
    expect(values).toEqual([since]);
  });

  it('joins the latest version of the first installment', async () => {
    await service.findActions(new Date());

    const { sql } = lastQuery(prisma);
    expect(sql).toContain('payment.installment_number = 1');
    expect(sql).toContain('ORDER BY payment.version DESC NULLS LAST');
    expect(sql).toContain('LIMIT 1');
    expect(sql).not.toContain('SELECT *');
  });

  it('classifies the action texts written by Wallet Admin', async () => {
    await service.findActions(new Date());

    const { sql } = lastQuery(prisma);
    expect(sql).toContain(
      "WHEN a.action LIKE 'Modified payment status%'      THEN 'STATUS_CHANGE'",
    );
    expect(sql).toContain(
      "WHEN a.action LIKE 'Modified payment amount%'      THEN 'AMOUNT_CHANGE'",
    );
    expect(sql).toContain(
      "WHEN a.action LIKE 'Modified release date%'        THEN 'RELEASE_DATE_CHANGE'",
    );
    expect(sql).toContain(
      "WHEN a.action LIKE 'Modified payment description%' THEN 'DESCRIPTION_CHANGE'",
    );
  });

  it('runs in the given transaction client', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };

    await service.findActions(new Date(), tx as any);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
