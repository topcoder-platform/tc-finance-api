jest.mock('./action-log.service', () => ({
  ActionLogService: class {},
}));

import { BadRequestException } from '@nestjs/common';

import { ROLES_KEY } from 'src/core/auth/decorators/roles.decorator';
import { WinningsCategory } from 'src/dto/winning.dto';

import { ActionLogController } from './action-log.controller';
import { ActionLogPaymentSource } from './action-log.dto';

describe('ActionLogController', () => {
  let actionLogService: {
    findActions: jest.Mock;
    findAdminUserIds: jest.Mock;
  };
  let controller: ActionLogController;

  const row = {
    auditId: '6f0e2a51-3d3e-4f0f-9a8e-0c1c9b6f1b11',
    adminUserId: '88774634',
    winnerId: '500021412',
    action: 'Modified payment status from ON_HOLD_ADMIN to OWED',
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-16T00:00:00Z') });
    actionLogService = {
      findActions: jest.fn().mockResolvedValue([row]),
      findAdminUserIds: jest.fn().mockResolvedValue(['88774634']),
    };
    controller = new ActionLogController(actionLogService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['getActionLog', 'getActionLogAdmins'] as const)(
    '%s is restricted to Administrator',
    (method) => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ActionLogController.prototype[method],
      );

      expect(roles).toEqual(['Administrator']);
    },
  );

  it('defaults to the last 90 days', async () => {
    const result = await controller.getActionLog({});

    expect(actionLogService.findActions).toHaveBeenCalledWith({
      since: new Date('2026-08-18T00:00:00Z'),
      until: undefined,
      paymentSource: undefined,
      categories: undefined,
      adminUserId: undefined,
    });
    expect(result.status).toBe('success');
    expect(result.data).toEqual([row]);
  });

  it('limits the log to the last N days', async () => {
    await controller.getActionLog({ days: 7 });

    expect(actionLogService.findActions).toHaveBeenCalledWith(
      expect.objectContaining({ since: new Date('2026-11-09T00:00:00Z') }),
    );
  });

  it('passes the date range and filters to the service', async () => {
    await controller.getActionLog({
      days: 7,
      dateFrom: '2026-10-01T00:00:00.000Z',
      dateTo: '2026-10-31T23:59:59.999Z',
      paymentSource: ActionLogPaymentSource.TOPCODER,
      categories: [WinningsCategory.TASK_PAYMENT],
      adminUserId: '88774634',
    });

    expect(actionLogService.findActions).toHaveBeenCalledWith({
      since: new Date('2026-10-01T00:00:00.000Z'),
      until: new Date('2026-10-31T23:59:59.999Z'),
      paymentSource: ActionLogPaymentSource.TOPCODER,
      categories: [WinningsCategory.TASK_PAYMENT],
      adminUserId: '88774634',
    });
  });

  it('counts the days back from dateTo when dateFrom is not given', async () => {
    await controller.getActionLog({ days: 7, dateTo: '2026-10-31T00:00:00Z' });

    expect(actionLogService.findActions).toHaveBeenCalledWith(
      expect.objectContaining({
        since: new Date('2026-10-24T00:00:00Z'),
        until: new Date('2026-10-31T00:00:00Z'),
      }),
    );
  });

  it('rejects a dateFrom after dateTo', async () => {
    await expect(
      controller.getActionLog({
        dateFrom: '2026-10-31T00:00:00Z',
        dateTo: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(actionLogService.findActions).not.toHaveBeenCalled();
  });

  it('rejects a range longer than 90 days', async () => {
    await expect(
      controller.getActionLog({ dateFrom: '2026-01-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(actionLogService.findActions).not.toHaveBeenCalled();
  });

  it('lists the admins who have actioned payments', async () => {
    const result = await controller.getActionLogAdmins();

    expect(result.data).toEqual(['88774634']);
  });
});
