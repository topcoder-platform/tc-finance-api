jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

import { Prisma } from '@prisma/client';

import { WinningsCategory } from 'src/dto/winning.dto';

import { ActionLogPaymentSource } from './action-log.dto';
import { ActionLogService } from './action-log.service';

describe('ActionLogService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: ActionLogService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new ActionLogService(prisma as any);
  });

  // flattens the nested Prisma.sql fragments into one statement
  const lastQuery = (client: { $queryRaw: jest.Mock }) => {
    const [strings, ...values] = client.$queryRaw.mock.calls[0];
    const query = Prisma.sql(strings as string[], ...values);
    return { sql: query.sql, values: query.values };
  };

  const since = new Date('2026-08-18T00:00:00Z');

  it('lists audit entries made since the given date, newest first', async () => {
    await service.findActions({ since });

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain('FROM audit a');
    expect(sql).toContain('WHERE a.created_at >= ?');
    expect(sql).toContain('ORDER BY a.created_at DESC');
    expect(values).toEqual([since]);
  });

  it('limits the actions to the given date range', async () => {
    const until = new Date('2026-09-01T00:00:00Z');

    await service.findActions({ since, until });

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain('WHERE a.created_at >= ? AND a.created_at <= ?');
    expect(values).toEqual([since, until]);
  });

  it('treats every category but TaaS and Topgear as Topcoder', async () => {
    await service.findActions({
      since,
      paymentSource: ActionLogPaymentSource.TOPCODER,
    });

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain(
      '(w.category IS NULL OR w.category::text NOT IN (?,?))',
    );
    expect(values).toEqual([since, 'TAAS_PAYMENT', 'TOPGEAR_PAYMENT']);
  });

  it.each([
    [ActionLogPaymentSource.TAAS, 'TAAS_PAYMENT'],
    [ActionLogPaymentSource.TOPGEAR, 'TOPGEAR_PAYMENT'],
  ])('limits %s actions to the %s category', async (source, category) => {
    await service.findActions({ since, paymentSource: source });

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain('w.category::text = ?');
    expect(values).toEqual([since, category]);
  });

  it('filters by payment categories and admin', async () => {
    await service.findActions({
      since,
      categories: [
        WinningsCategory.TASK_PAYMENT,
        WinningsCategory.CONTEST_PAYMENT,
      ],
      adminUserId: '88774634',
    });

    const { sql, values } = lastQuery(prisma);
    expect(sql).toContain('w.category::text IN (?,?)');
    expect(sql).toContain('a.user_id = ?');
    expect(values).toEqual([
      since,
      'TASK_PAYMENT',
      'CONTEST_PAYMENT',
      '88774634',
    ]);
  });

  it('lists the distinct admins in the audit table', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { userId: '1001' },
      { userId: '88774634' },
    ]);

    await expect(service.findAdminUserIds()).resolves.toEqual([
      '1001',
      '88774634',
    ]);

    const { sql } = lastQuery(prisma);
    expect(sql).toContain('SELECT DISTINCT a.user_id');
  });

  it('joins the latest version of the first installment', async () => {
    await service.findActions({ since });

    const { sql } = lastQuery(prisma);
    expect(sql).toContain('payment.installment_number = 1');
    expect(sql).toContain('ORDER BY payment.version DESC NULLS LAST');
    expect(sql).toContain('LIMIT 1');
    expect(sql).not.toContain('SELECT *');
  });

  it('classifies the action texts written by Wallet Admin', async () => {
    await service.findActions({ since });

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

    await service.findActions({ since }, tx as any);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
