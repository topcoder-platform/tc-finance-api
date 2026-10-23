jest.mock('src/shared/global', () => ({
  Logger: class {
    debug = jest.fn();

    error = jest.fn();

    info = jest.fn();

    log = jest.fn();

    warn = jest.fn();
  },
}));

const mockEnvConfig = {
  DUPLICATE_PAYMENTS_CHECK_CRON: '0 * * * *',
  DUPLICATE_PAYMENTS_CHECK_ENABLED: true,
  DUPLICATE_PAYMENTS_CHECK_LOOKBACK_HOURS: 2,
  DUPLICATE_PAYMENTS_ALERT_EMAILS: ['finance-alerts@topcoder.com'],
  SENDGRID_TEMPLATE_ID_DUPLICATE_PAYMENTS_ALERT: 'd-duplicate-alert' as
    string | undefined,
};

jest.mock('src/config', () => ({ ENV_CONFIG: mockEnvConfig }));

import {
  DUPLICATE_PAYMENTS_ALERT_MARKER,
  DuplicatePaymentRelease,
  DuplicatePaymentsMonitor,
} from './duplicate-payments.monitor';

const duplicate: DuplicatePaymentRelease = {
  userId: '500021412',
  release1Id: 'a0d1b0c8-18e2-47b1-b3bf-1093fe9068b6',
  release2Id: '0cdd624c-7a7b-4851-99ba-1af52e807938',
  release1Status: 'PROCESSED',
  release2Status: 'PROCESSED',
  release1CreatedAt: new Date('2026-10-09T13:05:44Z'),
  release2CreatedAt: new Date('2026-10-09T13:06:23Z'),
  trolleyPayment1Id: 'P-Jj7B3JBkJsSVTNteSSXTkj',
  trolleyPayment2Id: 'P-QGc5yVN75pftMUF2d86sNv',
  sharedPayments: 8,
  sharedAmount: '10893.00',
};

describe('DuplicatePaymentsMonitor', () => {
  let tx: { $queryRaw: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let tcEmailService: { sendEmail: jest.Mock };
  let monitor: DuplicatePaymentsMonitor;

  const mockQueryResults = (locked: boolean, rows: unknown[] = []) => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ locked }])
      .mockResolvedValueOnce(rows);
  };

  beforeEach(() => {
    mockEnvConfig.DUPLICATE_PAYMENTS_ALERT_EMAILS = [
      'finance-alerts@topcoder.com',
    ];
    mockEnvConfig.SENDGRID_TEMPLATE_ID_DUPLICATE_PAYMENTS_ALERT =
      'd-duplicate-alert';

    tx = { $queryRaw: jest.fn() };
    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((cb: (client: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
    };
    tcEmailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    monitor = new DuplicatePaymentsMonitor(
      prisma as any,
      tcEmailService as any,
    );
  });

  it('skips the check when another instance holds the advisory lock', async () => {
    mockQueryResults(false);

    await expect(monitor.checkForDuplicates()).resolves.toBeUndefined();

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tcEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('does not alert when there are no duplicates', async () => {
    mockQueryResults(true, []);

    await expect(monitor.checkForDuplicates()).resolves.toEqual([]);

    expect(tcEmailService.sendEmail).not.toHaveBeenCalled();
    expect((monitor as any).logger.error).not.toHaveBeenCalled();
  });

  it('logs the alert marker and emails the duplicates', async () => {
    mockQueryResults(true, [duplicate]);

    await expect(monitor.checkForDuplicates()).resolves.toEqual([duplicate]);

    expect((monitor as any).logger.error).toHaveBeenCalledWith(
      expect.stringContaining(DUPLICATE_PAYMENTS_ALERT_MARKER),
      [duplicate],
    );
    expect(tcEmailService.sendEmail).toHaveBeenCalledWith(
      ['finance-alerts@topcoder.com'],
      'd-duplicate-alert',
      {
        data: {
          duplicates_count: 1,
          lookback_hours: 2,
          duplicates: [
            {
              user_id: '500021412',
              release_1_id: 'a0d1b0c8-18e2-47b1-b3bf-1093fe9068b6',
              release_2_id: '0cdd624c-7a7b-4851-99ba-1af52e807938',
              release_1_status: 'PROCESSED',
              release_2_status: 'PROCESSED',
              release_1_created_at: '2026-10-09T13:05:44.000Z',
              release_2_created_at: '2026-10-09T13:06:23.000Z',
              trolley_payment_1_id: 'P-Jj7B3JBkJsSVTNteSSXTkj',
              trolley_payment_2_id: 'P-QGc5yVN75pftMUF2d86sNv',
              shared_payments: 8,
              shared_amount: '10893.00',
            },
          ],
        },
      },
    );
  });

  it('passes the lookback window to the query', async () => {
    mockQueryResults(true, []);

    await monitor.checkForDuplicates();

    const [strings, ...values] = tx.$queryRaw.mock.calls[1];
    expect(strings.join('?')).toContain("NOT IN ('FAILED', 'RETURNED')");
    expect(values).toContain(2);
  });

  it('only logs the alert when email is not configured', async () => {
    mockEnvConfig.SENDGRID_TEMPLATE_ID_DUPLICATE_PAYMENTS_ALERT = undefined;
    mockQueryResults(true, [duplicate]);

    await monitor.checkForDuplicates();

    expect((monitor as any).logger.error).toHaveBeenCalledWith(
      expect.stringContaining(DUPLICATE_PAYMENTS_ALERT_MARKER),
      [duplicate],
    );
    expect(tcEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('still returns the duplicates when the alert email fails', async () => {
    tcEmailService.sendEmail.mockRejectedValueOnce(new Error('bus down'));
    mockQueryResults(true, [duplicate]);

    await expect(monitor.checkForDuplicates()).resolves.toEqual([duplicate]);

    expect((monitor as any).logger.error).toHaveBeenCalledWith(
      'Failed to send duplicate payments alert email: bus down',
    );
  });

  it('does not throw from the scheduled run when the check fails', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(monitor.runScheduledCheck()).resolves.toBeUndefined();

    expect((monitor as any).logger.error).toHaveBeenCalledWith(
      'Duplicate payments check failed: db down',
    );
  });
});
