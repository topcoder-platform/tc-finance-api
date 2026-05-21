import { NotFoundException } from '@nestjs/common';

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    debug() {}

    error() {}

    log() {}

    warn() {}
  },
}));

jest.mock('src/shared/global/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('src/shared/topcoder/billing-accounts.service', () => ({
  BillingAccountsService: class {},
}));

jest.mock('src/shared/topcoder/engagements.service', () => ({
  TopcoderEngagementsService: class {},
}));

jest.mock('src/shared/payments', () => ({
  PaymentsService: class {},
}));

jest.mock('src/shared/access-control/access-control.service', () => ({
  AccessControlService: class {},
}));

jest.mock('src/shared/topcoder/members.service', () => ({
  TopcoderMembersService: class {},
}));

jest.mock('src/shared/topcoder/challenges.service', () => ({
  TopcoderChallengesService: class {},
}));

import { AdminService } from './admin.service';
import { PaymentStatus } from 'src/dto/payment.dto';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    $transaction: jest.Mock;
    audit: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    payment: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    payment_releases: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    winnings: {
      findFirst: jest.Mock;
    };
  };
  let paymentsService: {
    reconcileUserPayments: jest.Mock;
  };
  let baService: {
    getBillingAccountById: jest.Mock;
    getBillingAccountsForUser: jest.Mock;
    lockConsumeAmount: jest.Mock;
    syncEngagementConsumeAmounts: jest.Mock;
  };
  let accessControlService: {
    verifyAccess: jest.Mock;
  };
  let topcoderEngagementsService: {
    getAssignmentContextById: jest.Mock;
    getEngagementById: jest.Mock;
  };
  let tcMembersService: {
    getHandlesByUserIds: jest.Mock;
  };
  let topcoderChallengesService: {
    getChallengeById: jest.Mock;
    getProjectById: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
      audit: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      payment_releases: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      winnings: {
        findFirst: jest.fn(),
      },
    };
    paymentsService = {
      reconcileUserPayments: jest.fn().mockResolvedValue(undefined),
    };
    baService = {
      getBillingAccountById: jest
        .fn()
        .mockResolvedValue({ id: 80001012, markup: 0.1 }),
      getBillingAccountsForUser: jest.fn().mockResolvedValue(['80001012']),
      lockConsumeAmount: jest.fn().mockResolvedValue(undefined),
      syncEngagementConsumeAmounts: jest.fn().mockResolvedValue(undefined),
    };
    accessControlService = {
      verifyAccess: jest.fn().mockResolvedValue(undefined),
    };
    topcoderEngagementsService = {
      getAssignmentContextById: jest.fn(),
      getEngagementById: jest.fn(),
    };
    tcMembersService = {
      getHandlesByUserIds: jest.fn().mockResolvedValue({
        '654321': 'payment-manager',
      }),
    };
    topcoderChallengesService = {
      getChallengeById: jest.fn().mockResolvedValue(undefined),
      getProjectById: jest.fn().mockResolvedValue(undefined),
    };

    service = new AdminService(
      prisma as any,
      paymentsService as any,
      baService as any,
      accessControlService as any,
      topcoderEngagementsService as any,
      tcMembersService as any,
      topcoderChallengesService as any,
    );
  });

  it('returns engagement budgetApproverHandle from winnings attributes challengeId', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {
        challengeId: 'challenge-uuid-1',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      engagementId: 'engagement-1',
      engagementTitle: 'May 19 pvt eng',
      projectId: '100575',
      projectName: 'Ai Reviewer Wf testing',
      ratePerHour: '2.99',
      standardHoursPerWeek: 11,
      startDate: '2026-05-23T12:00:00.000Z',
      durationMonths: 2,
    });
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      id: 'challenge-uuid-1',
      name: 'Engagement challenge',
      projectId: 100575,
      approvalApprovedBy: 'kartik',
    });

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(topcoderChallengesService.getChallengeById).toHaveBeenCalledWith(
      'challenge-uuid-1',
    );
    expect(result.data?.engagementDetails?.budgetApproverHandle).toBe('kartik');
  });

  it('returns engagement budgetApproverHandle from winnings attributes directly', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {
        budgetApproverHandle: 'kartik',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      engagementId: 'engagement-1',
      engagementTitle: 'May 19 pvt eng',
      projectId: '100575',
      ratePerHour: '2.99',
      standardHoursPerWeek: 11,
      startDate: '2026-05-23T12:00:00.000Z',
      durationMonths: 2,
    });

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(topcoderChallengesService.getChallengeById).not.toHaveBeenCalled();
    expect(result.data?.engagementDetails?.budgetApproverHandle).toBe('kartik');
  });

  it('returns paymentApproverHandle for engagement payments from audit trail', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {},
    });
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      engagementId: 'engagement-1',
      engagementTitle: 'May 19 pvt eng',
      projectId: '100575',
      projectName: 'Ai Reviewer Wf testing',
      ratePerHour: '2.99',
      standardHoursPerWeek: 11,
      startDate: '2026-05-23T12:00:00.000Z',
      durationMonths: 2,
    });
    prisma.audit.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        winnings_id: 'winning-1',
        user_id: '654321',
        action: 'status updated from ON_HOLD_ADMIN to OWED',
        note: null,
        created_at: new Date(),
      },
    ]);

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(result.data?.engagementDetails?.paymentApproverHandle).toBe(
      'payment-manager',
    );
    expect(result.data?.engagementDetails?.assignmentId).toBe('assignment-1');
  });

  it('returns work-log and engagement details for engagement payments', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {
        hoursWorked: 12.5,
        remarks: 'Completed sprint support and bug triage.',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: 'assignment-1',
      engagementId: 'engagement-1',
      engagementTitle: 'Senior Frontend Engineer',
      otherRemarks: 'Complete onboarding within the first week.',
      projectId: 'project-1',
      projectName: 'Platform Modernization',
      ratePerHour: '75.50',
      standardHoursPerWeek: 40,
      startDate: '2026-02-12T00:00:00.000Z',
      durationMonths: 3,
    });

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(accessControlService.verifyAccess).toHaveBeenCalledWith(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );
    expect(
      topcoderEngagementsService.getAssignmentContextById,
    ).toHaveBeenCalledWith('assignment-1');
    expect(tcMembersService.getHandlesByUserIds).toHaveBeenCalledWith([
      '654321',
    ]);
    expect(result.data).toEqual({
      engagementDetails: {
        assignmentId: 'assignment-1',
        billingStartDate: new Date('2026-02-12T00:00:00.000Z'),
        durationMonths: 3,
        engagementId: 'engagement-1',
        engagementTitle: 'Senior Frontend Engineer',
        otherRemarks: 'Complete onboarding within the first week.',
        projectId: 'project-1',
        projectName: 'Platform Modernization',
        ratePerHour: '75.50',
        standardHoursPerWeek: 40,
      },
      paymentCreatorHandle: 'payment-manager',
      workLog: {
        hoursWorked: 12.5,
        remarks: 'Completed sprint support and bug triage.',
      },
    });
  });

  it('returns only work-log data when engagement context lookup fails', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {
        hoursWorked: 8,
        remarks: 'Weekly support work.',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockRejectedValue(
      new Error('upstream unavailable'),
    );

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(result.data).toEqual({
      paymentCreatorHandle: 'payment-manager',
      workLog: {
        hoursWorked: 8,
        remarks: 'Weekly support work.',
      },
    });
  });

  it('falls back to the engagement lookup when external_id stores an engagement id', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      winner_id: '123456',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'engagement-1',
      attributes: {
        hoursWorked: 10,
        remarks: 'Covered support hours.',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockRejectedValue(
      new Error('assignment not found'),
    );
    topcoderEngagementsService.getEngagementById.mockResolvedValue({
      assignments: [
        {
          durationMonths: 6,
          id: 'assignment-1',
          memberId: '123456',
          otherRemarks: 'Working EST overlap.',
          ratePerHour: '82.50',
          standardHoursPerWeek: 35,
          startDate: '2026-01-15T00:00:00.000Z',
        },
      ],
      id: 'engagement-1',
      projectId: 'project-1',
      projectName: 'Platform Modernization',
      title: 'Senior Frontend Engineer',
    });

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(
      topcoderEngagementsService.getAssignmentContextById,
    ).toHaveBeenCalledWith('engagement-1');
    expect(topcoderEngagementsService.getEngagementById).toHaveBeenCalledWith(
      'engagement-1',
    );
    expect(result.data).toEqual({
      engagementDetails: {
        assignmentId: 'assignment-1',
        billingStartDate: new Date('2026-01-15T00:00:00.000Z'),
        durationMonths: 6,
        engagementId: 'engagement-1',
        engagementTitle: 'Senior Frontend Engineer',
        otherRemarks: 'Working EST overlap.',
        projectId: 'project-1',
        projectName: 'Platform Modernization',
        ratePerHour: '82.50',
        standardHoursPerWeek: 35,
      },
      paymentCreatorHandle: 'payment-manager',
      workLog: {
        hoursWorked: 10,
        remarks: 'Covered support hours.',
      },
    });
  });

  it('falls back to the creator id when the handle lookup misses', async () => {
    tcMembersService.getHandlesByUserIds.mockResolvedValue({});
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      created_by: '654321',
      external_id: 'assignment-1',
      attributes: {
        hoursWorked: 8,
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockRejectedValue(
      new Error('upstream unavailable'),
    );

    const result = await service.getWinningPaymentDetails(
      'winning-1',
      '123456',
      ['Payment Admin'],
    );

    expect(result.data).toEqual({
      paymentCreatorHandle: '654321',
      workLog: {
        hoursWorked: 8,
        remarks: undefined,
      },
    });
  });

  it('prefers a numeric assignmentId stored in winning attributes', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
      external_id: 'engagement-1',
      attributes: {
        assignmentId: 98765,
        hoursWorked: 12,
        remarks: 'Weekly support work.',
      },
    });
    topcoderEngagementsService.getAssignmentContextById.mockResolvedValue({
      assignmentId: '98765',
      engagementId: 'engagement-1',
      engagementTitle: 'Senior Frontend Engineer',
      projectId: 'project-1',
      projectName: 'Platform Modernization',
      ratePerHour: '75.50',
      standardHoursPerWeek: 40,
      startDate: '2026-02-12T00:00:00.000Z',
      status: 'ACTIVE',
      memberHandle: 'tester',
      memberId: '123456',
    });

    await service.getWinningPaymentDetails('winning-1', '123456', [
      'Payment Admin',
    ]);

    expect(
      topcoderEngagementsService.getAssignmentContextById,
    ).toHaveBeenCalledWith('98765');
    expect(topcoderEngagementsService.getEngagementById).not.toHaveBeenCalled();
  });

  it('throws when the winning does not exist', async () => {
    prisma.winnings.findFirst.mockResolvedValue(null);

    await expect(
      service.getWinningPaymentDetails('missing-winning', '123456', []),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recalculates the challenge billing-account line item when a challenge payment is cancelled', async () => {
    prisma.payment.findMany
      .mockResolvedValueOnce([
        {
          billing_account: '80001012',
          currency: 'USD',
          installment_number: 1,
          payment_id: 'payment-1',
          payment_status: PaymentStatus.OWED,
          release_date: new Date('2026-04-27T00:00:00.000Z'),
          version: 1,
          winnings: {
            category: 'CONTEST_PAYMENT',
            external_id: 'challenge-1',
            type: 'PAYMENT',
          },
        },
      ])
      .mockResolvedValueOnce([
        { total_amount: '12.00' },
        { total_amount: '27.50' },
      ]);
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      billing: {
        billingAccountId: '80001012',
        markup: 0.1,
      },
      id: 'challenge-1',
      status: 'COMPLETED',
    });

    const result = await service.updateWinnings(
      {
        paymentId: 'payment-1',
        paymentStatus: PaymentStatus.CANCELLED,
        winningsId: 'winning-1',
      } as any,
      'admin-1',
      ['Payment Admin'],
    );

    expect(result.data).toBe('Successfully updated winnings');
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: {
        payment_id: 'payment-1',
        winnings_id: 'winning-1',
        version: 1,
      },
      data: {
        date_paid: undefined,
        payment_status: PaymentStatus.CANCELLED,
        updated_at: expect.any(Date),
        updated_by: 'admin-1',
        version: 2,
      },
    });
    expect(prisma.payment.findMany).toHaveBeenNthCalledWith(2, {
      select: { total_amount: true },
      where: {
        billing_account: '80001012',
        currency: 'USD',
        payment_status: { not: PaymentStatus.CANCELLED },
        winnings: {
          external_id: 'challenge-1',
          type: 'PAYMENT',
        },
      },
    });
    expect(baService.lockConsumeAmount).toHaveBeenCalledWith({
      billingAccountId: 80001012,
      challengeId: 'challenge-1',
      markup: 0.1,
      status: 'COMPLETED',
      totalPrizesInCents: 3950,
    });
  });

  it('releases engagement billing-account rows when an engagement payment is cancelled', async () => {
    prisma.payment.findMany
      .mockResolvedValueOnce([
        {
          billing_account: '80001012',
          currency: 'USD',
          installment_number: 1,
          payment_id: 'payment-1',
          payment_status: PaymentStatus.OWED,
          release_date: new Date('2026-04-28T00:00:00.000Z'),
          version: 1,
          winnings: {
            category: 'ENGAGEMENT_PAYMENT',
            external_id: 'assignment-1',
            type: 'PAYMENT',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.updateWinnings(
      {
        paymentId: 'payment-1',
        paymentStatus: PaymentStatus.CANCELLED,
        winningsId: 'winning-1',
      } as any,
      'admin-1',
      ['Payment Admin'],
    );

    expect(result.data).toBe('Successfully updated winnings');
    expect(prisma.payment.findMany).toHaveBeenNthCalledWith(2, {
      select: {
        challenge_fee: true,
        total_amount: true,
      },
      where: {
        billing_account: '80001012',
        currency: 'USD',
        payment_status: { not: PaymentStatus.CANCELLED },
        winnings: {
          category: 'ENGAGEMENT_PAYMENT',
          external_id: 'assignment-1',
          type: 'PAYMENT',
        },
      },
      orderBy: [{ created_at: 'asc' }, { payment_id: 'asc' }],
    });
    expect(baService.syncEngagementConsumeAmounts).toHaveBeenCalledWith({
      amounts: [],
      billingAccountId: 80001012,
      externalId: 'assignment-1',
    });
    expect(baService.lockConsumeAmount).not.toHaveBeenCalled();
  });

  it('recalculates the challenge billing-account line item when a challenge payment amount is adjusted', async () => {
    prisma.payment.findMany
      .mockResolvedValueOnce([
        {
          billing_account: '80001012',
          currency: 'USD',
          installment_number: 1,
          payment_id: 'payment-1',
          payment_status: PaymentStatus.OWED,
          release_date: new Date('2026-04-27T00:00:00.000Z'),
          total_amount: '100.00',
          version: 1,
          winnings: {
            category: 'CONTEST_PAYMENT',
            description: 'Challenge payment',
            external_id: 'challenge-1',
            type: 'PAYMENT',
          },
        },
      ])
      .mockResolvedValueOnce([
        { total_amount: '150.00' },
        { total_amount: '25.00' },
      ]);
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      billing: {
        billingAccountId: '80001012',
        markup: 0.1,
      },
      id: 'challenge-1',
      status: 'COMPLETED',
    });

    const result = await service.updateWinnings(
      {
        paymentAmount: 150,
        paymentId: 'payment-1',
        winningsId: 'winning-1',
      } as any,
      'admin-1',
      ['Payment Admin'],
    );

    expect(result.data).toBe('Successfully updated winnings');
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: {
        payment_id: 'payment-1',
        winnings_id: 'winning-1',
        version: 1,
        payment_status: {
          in: [
            PaymentStatus.CREDITED,
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
            PaymentStatus.PAID,
            PaymentStatus.PROCESSING,
          ],
        },
      },
      data: {
        challenge_fee: undefined,
        gross_amount: 150,
        net_amount: 150,
        total_amount: 150,
        updated_at: expect.any(Date),
        updated_by: 'admin-1',
        version: 2,
      },
    });
    expect(baService.lockConsumeAmount).toHaveBeenCalledWith({
      billingAccountId: 80001012,
      challengeId: 'challenge-1',
      markup: 0.1,
      status: 'COMPLETED',
      totalPrizesInCents: 17500,
    });
  });

  it('updates engagement challenge fee and consumed rows when an engagement payment amount is adjusted', async () => {
    prisma.payment.findMany
      .mockResolvedValueOnce([
        {
          billing_account: '80001012',
          challenge_markup: '0.20',
          currency: 'USD',
          installment_number: 1,
          payment_id: 'payment-1',
          payment_status: PaymentStatus.OWED,
          release_date: new Date('2026-04-28T00:00:00.000Z'),
          total_amount: '100.00',
          version: 1,
          winnings: {
            category: 'ENGAGEMENT_PAYMENT',
            description: 'Engagement payment',
            external_id: 'assignment-1',
            type: 'PAYMENT',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          challenge_fee: '30.00',
          total_amount: '150.00',
        },
      ]);

    const result = await service.updateWinnings(
      {
        paymentAmount: 150,
        paymentId: 'payment-1',
        winningsId: 'winning-1',
      } as any,
      'admin-1',
      ['Payment Admin'],
    );

    expect(result.data).toBe('Successfully updated winnings');
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: {
        payment_id: 'payment-1',
        winnings_id: 'winning-1',
        version: 1,
        payment_status: {
          in: [
            PaymentStatus.CREDITED,
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
            PaymentStatus.PAID,
            PaymentStatus.PROCESSING,
          ],
        },
      },
      data: {
        challenge_fee: 30,
        gross_amount: 150,
        net_amount: 150,
        total_amount: 150,
        updated_at: expect.any(Date),
        updated_by: 'admin-1',
        version: 2,
      },
    });
    expect(baService.syncEngagementConsumeAmounts).toHaveBeenCalledWith({
      amounts: [180],
      billingAccountId: 80001012,
      externalId: 'assignment-1',
    });
    expect(baService.lockConsumeAmount).not.toHaveBeenCalled();
  });

  it('returns task details for task payment with projectId and approver', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-task',
      category: 'TASK_PAYMENT',
      created_by: '654321',
      winner_id: '123456',
      external_id: 'challenge-uuid-1',
      attributes: {},
    });
    topcoderChallengesService.getChallengeById.mockResolvedValue({
      id: 'challenge-uuid-1',
      name: 'Build a widget',
      projectId: 42,
      createdBy: 'challenge-creator',
    });
    topcoderChallengesService.getProjectById.mockResolvedValue({
      id: 42,
      name: 'My Project',
    });
    prisma.audit.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        winnings_id: 'winning-task',
        user_id: '654321',
        action: 'status updated from ON_HOLD_ADMIN to OWED',
        note: null,
        created_at: new Date(),
      },
    ]);

    const result = await service.getWinningPaymentDetails(
      'winning-task',
      '123456',
      ['Payment Admin'],
    );

    expect(result.data?.taskDetails?.projectId).toBe('42');
    expect(result.data?.taskDetails?.projectName).toBe('My Project');
    expect(result.data?.taskDetails?.paymentCreatorHandle).toBe(
      'challenge-creator',
    );
    expect(result.data?.taskDetails?.paymentApproverHandle).toBe(
      'payment-manager',
    );
  });
});
