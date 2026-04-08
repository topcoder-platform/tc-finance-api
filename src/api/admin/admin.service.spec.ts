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

import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    winnings: {
      findFirst: jest.Mock;
    };
  };
  let paymentsService: object;
  let baService: object;
  let accessControlService: {
    verifyAccess: jest.Mock;
  };
  let topcoderEngagementsService: {
    getAssignmentContextById: jest.Mock;
    getEngagementById: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      winnings: {
        findFirst: jest.fn(),
      },
    };
    paymentsService = {};
    baService = {};
    accessControlService = {
      verifyAccess: jest.fn().mockResolvedValue(undefined),
    };
    topcoderEngagementsService = {
      getAssignmentContextById: jest.fn(),
      getEngagementById: jest.fn(),
    };

    service = new AdminService(
      prisma as any,
      paymentsService as any,
      baService as any,
      accessControlService as any,
      topcoderEngagementsService as any,
    );
  });

  it('returns work-log and engagement details for engagement payments', async () => {
    prisma.winnings.findFirst.mockResolvedValue({
      winning_id: 'winning-1',
      category: 'ENGAGEMENT_PAYMENT',
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
      workLog: {
        hoursWorked: 10,
        remarks: 'Covered support hours.',
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
});
