jest.mock('./action-log.service', () => ({
  ActionLogService: class {},
}));

import { ROLES_KEY } from 'src/core/auth/decorators/roles.decorator';
import { ActionLogController } from './action-log.controller';

describe('ActionLogController', () => {
  let actionLogService: { findActions: jest.Mock };
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
    };
    controller = new ActionLogController(actionLogService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is restricted to Administrator', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ActionLogController.prototype.getActionLog,
    );

    expect(roles).toEqual(['Administrator']);
  });

  it('defaults to the last 90 days', async () => {
    const result = await controller.getActionLog({});

    expect(actionLogService.findActions).toHaveBeenCalledWith(
      new Date('2026-08-18T00:00:00Z'),
    );
    expect(result.status).toBe('success');
    expect(result.data).toEqual([row]);
  });

  it('limits the log to the last N days', async () => {
    await controller.getActionLog({ days: 7 });

    expect(actionLogService.findActions).toHaveBeenCalledWith(
      new Date('2026-11-09T00:00:00Z'),
    );
  });
});
