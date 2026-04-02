import { Role } from 'src/core/auth/auth.constants';
import { AccessControlService } from './access-control.service';
import { RoleAccessProvider } from './role-access.interface';

describe('AccessControlService', () => {
  let service: AccessControlService;

  beforeEach(() => {
    service = new AccessControlService();
  });

  it('skips engagement approver filters when payment admin role is also present', async () => {
    const paymentAdminApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          admin: true,
        }),
      );
    const engagementApproverApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          category: 'ENGAGEMENT_PAYMENT',
        }),
      );
    const paymentAdminProvider: RoleAccessProvider<Record<string, unknown>> = {
      roleName: Role.PaymentAdmin,
      applyFilter: paymentAdminApplyFilter,
    };
    const engagementApproverProvider: RoleAccessProvider<
      Record<string, unknown>
    > = {
      roleName: Role.EngagementPaymentApprover,
      applyFilter: engagementApproverApplyFilter,
    };

    service.register(paymentAdminProvider);
    service.register(engagementApproverProvider);

    const result = await service.applyFilters<Record<string, unknown>>(
      '88770025',
      [Role.PaymentAdmin, Role.EngagementPaymentApprover],
      { type: 'PAYMENT' },
    );

    expect(result).toEqual({
      admin: true,
      type: 'PAYMENT',
    });
    expect(paymentAdminApplyFilter).toHaveBeenCalledTimes(1);
    expect(engagementApproverApplyFilter).not.toHaveBeenCalled();
  });

  it('applies engagement approver filters when payment admin role is absent', async () => {
    const engagementApproverApplyFilter = jest
      .fn()
      .mockImplementation((_userId, req: Record<string, unknown>) =>
        Promise.resolve({
          ...req,
          category: 'ENGAGEMENT_PAYMENT',
        }),
      );
    const engagementApproverProvider: RoleAccessProvider<
      Record<string, unknown>
    > = {
      roleName: Role.EngagementPaymentApprover,
      applyFilter: engagementApproverApplyFilter,
    };

    service.register(engagementApproverProvider);

    const result = await service.applyFilters<Record<string, unknown>>(
      '88770025',
      [Role.EngagementPaymentApprover],
      { type: 'PAYMENT' },
    );

    expect(result).toEqual({
      category: 'ENGAGEMENT_PAYMENT',
      type: 'PAYMENT',
    });
    expect(engagementApproverApplyFilter).toHaveBeenCalledTimes(1);
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

  it('skips engagement approver resource checks when payment admin role is also present', async () => {
    const paymentAdminVerifyAccess = jest.fn().mockResolvedValue(undefined);
    const engagementApproverVerifyAccess = jest
      .fn()
      .mockRejectedValue(new Error('should not be called'));
    const paymentAdminProvider: RoleAccessProvider = {
      roleName: Role.PaymentAdmin,
      verifyAccessToResource: paymentAdminVerifyAccess,
    };
    const engagementApproverProvider: RoleAccessProvider = {
      roleName: Role.EngagementPaymentApprover,
      verifyAccessToResource: engagementApproverVerifyAccess,
    };

    service.register(paymentAdminProvider);
    service.register(engagementApproverProvider);

    await expect(
      service.verifyAccess('winning-id', '88770025', [
        Role.PaymentAdmin,
        Role.EngagementPaymentApprover,
      ]),
    ).resolves.toBeUndefined();

    expect(paymentAdminVerifyAccess).toHaveBeenCalledTimes(1);
    expect(engagementApproverVerifyAccess).not.toHaveBeenCalled();
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
