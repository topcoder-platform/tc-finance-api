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

  it('throws when the winning does not exist', async () => {
    prisma.winnings.findFirst.mockResolvedValue(null);

    await expect(
      service.getWinningPaymentDetails('missing-winning', '123456', []),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
