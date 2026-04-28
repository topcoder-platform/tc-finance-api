import { Role } from 'src/core/auth/auth.constants';
import { AccessControlService } from './access-control.service';
import { RoleAccessProvider } from './role-access.interface';

describe('AccessControlService', () => {
  let service: AccessControlService;

  beforeEach(() => {
    service = new AccessControlService();
  });

  it('skips approver filters when payment admin role is also present', async () => {
    const paymentAdminApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          admin: true,
        }),
      );
    const approverApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          categories: ['ENGAGEMENT_PAYMENT', 'TASK_PAYMENT'],
        }),
      );
    const paymentAdminProvider: RoleAccessProvider<Record<string, unknown>> = {
      roleName: Role.PaymentAdmin,
      applyFilter: paymentAdminApplyFilter,
    };
    const approverProvider: RoleAccessProvider<Record<string, unknown>> = {
      roleName: Role.PaymentApprover,
      applyFilter: approverApplyFilter,
    };

    service.register(paymentAdminProvider);
    service.register(approverProvider);

    const result = await service.applyFilters<Record<string, unknown>>(
      '88770025',
      [Role.PaymentAdmin, Role.PaymentApprover],
      { type: 'PAYMENT' },
    );

    expect(result).toEqual({
      admin: true,
      type: 'PAYMENT',
    });
    expect(paymentAdminApplyFilter).toHaveBeenCalledTimes(1);
    expect(approverApplyFilter).not.toHaveBeenCalled();
  });

  it('applies approver filters when payment admin role is absent', async () => {
    const approverApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          categories: ['ENGAGEMENT_PAYMENT', 'TASK_PAYMENT'],
        }),
      );
    const approverProvider: RoleAccessProvider<Record<string, unknown>> = {
      roleName: Role.PaymentApprover,
      applyFilter: approverApplyFilter,
    };

    service.register(approverProvider);

    const result = await service.applyFilters<Record<string, unknown>>(
      '88770025',
      [Role.PaymentApprover],
      { type: 'PAYMENT' },
    );

    expect(result).toEqual({
      categories: ['ENGAGEMENT_PAYMENT', 'TASK_PAYMENT'],
      type: 'PAYMENT',
    });
    expect(approverApplyFilter).toHaveBeenCalledTimes(1);
  });

  it('applies wipro taas admin filters when payment admin role is absent', async () => {
    const wiproTaasAdminApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          category: 'TAAS_PAYMENT',
        }),
      );
    const wiproTaasAdminProvider: RoleAccessProvider<Record<string, unknown>> =
      {
        roleName: Role.WiproTaasAdmin,
        applyFilter: wiproTaasAdminApplyFilter,
      };

    service.register(wiproTaasAdminProvider);

    const result = await service.applyFilters<Record<string, unknown>>(
      '88770025',
      [Role.WiproTaasAdmin],
      { type: 'PAYMENT' },
    );

    expect(result).toEqual({
      category: 'TAAS_PAYMENT',
      type: 'PAYMENT',
    });
    expect(wiproTaasAdminApplyFilter).toHaveBeenCalledTimes(1);
  });

  it('skips approver resource checks when payment admin role is also present', async () => {
    const paymentAdminVerifyAccess = jest.fn().mockResolvedValue(undefined);
    const approverVerifyAccess = jest
      .fn()
      .mockRejectedValue(new Error('should not be called'));
    const paymentAdminProvider: RoleAccessProvider = {
      roleName: Role.PaymentAdmin,
      verifyAccessToResource: paymentAdminVerifyAccess,
    };
    const approverProvider: RoleAccessProvider = {
      roleName: Role.PaymentApprover,
      verifyAccessToResource: approverVerifyAccess,
    };

    service.register(paymentAdminProvider);
    service.register(approverProvider);

    await expect(
      service.verifyAccess('winning-id', '88770025', [
        Role.PaymentAdmin,
        Role.PaymentApprover,
      ]),
    ).resolves.toBeUndefined();

    expect(paymentAdminVerifyAccess).toHaveBeenCalledTimes(1);
    expect(approverVerifyAccess).not.toHaveBeenCalled();
  });

  it('skips wipro taas admin resource checks when payment admin role is also present', async () => {
    const paymentAdminVerifyAccess = jest.fn().mockResolvedValue(undefined);
    const wiproTaasAdminVerifyAccess = jest
      .fn()
      .mockRejectedValue(new Error('should not be called'));
    const paymentAdminProvider: RoleAccessProvider = {
      roleName: Role.PaymentAdmin,
      verifyAccessToResource: paymentAdminVerifyAccess,
    };
    const wiproTaasAdminProvider: RoleAccessProvider = {
      roleName: Role.WiproTaasAdmin,
      verifyAccessToResource: wiproTaasAdminVerifyAccess,
    };

    service.register(paymentAdminProvider);
    service.register(wiproTaasAdminProvider);

    await expect(
      service.verifyAccess('winning-id', '88770025', [
        Role.PaymentAdmin,
        Role.WiproTaasAdmin,
      ]),
    ).resolves.toBeUndefined();

    expect(paymentAdminVerifyAccess).toHaveBeenCalledTimes(1);
    expect(wiproTaasAdminVerifyAccess).not.toHaveBeenCalled();
  });
});
