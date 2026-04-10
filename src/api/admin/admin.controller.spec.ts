jest.mock('./admin.service', () => ({
  AdminService: class {},
}));

jest.mock('../repository/winnings.repo', () => ({
  WinningsRepository: class {},
}));

jest.mock('src/shared/topcoder/members.service', () => ({
  TopcoderMembersService: class {},
}));

jest.mock('src/shared/access-control', () => ({
  AccessControlService: class {},
}));

import { AdminController } from './admin.controller';
import { PaymentStatus } from 'src/dto/payment.dto';
import {
  WinningRequestDto,
  WinningsCategory,
  WinningsType,
} from 'src/dto/winning.dto';

describe('AdminController', () => {
  let controller: AdminController;
  let winningsRepo: {
    searchWinnings: jest.Mock;
  };
  let tcMembersService: {
    getHandlesByUserIds: jest.Mock;
  };
  let accessControlService: {
    applyFilters: jest.Mock;
  };

  beforeEach(() => {
    winningsRepo = {
      searchWinnings: jest.fn(),
    };
    tcMembersService = {
      getHandlesByUserIds: jest.fn(),
    };
    accessControlService = {
      applyFilters: jest.fn(),
    };

    controller = new AdminController(
      {} as any,
      winningsRepo as any,
      tcMembersService as any,
      accessControlService as any,
    );
  });

  it('includes the payment creator column for engagement-style payment exports only', async () => {
    accessControlService.applyFilters.mockResolvedValue({
      type: WinningsType.PAYMENT,
    } satisfies WinningRequestDto);
    winningsRepo.searchWinnings
      .mockResolvedValueOnce({
        data: {
          winnings: [
            {
              id: 'winning-1',
              winnerId: '1001',
              createdBy: '9001',
              origin: 'Topcoder',
              category: WinningsCategory.ENGAGEMENT_PAYMENT,
              title: 'Engagement payment',
              description: 'Monthly engagement payment',
              externalId: 'assignment-1',
              details: [
                {
                  status: PaymentStatus.OWED,
                  totalAmount: 1200,
                  datePaid: new Date('2026-04-09T01:02:03.000Z'),
                  billingAccount: '80001063',
                },
              ],
              paymentStatus: {} as any,
              attributes: {},
              createdAt: new Date('2026-04-09T01:02:03.000Z'),
              updatedAt: new Date('2026-04-09T04:05:06.000Z'),
              releaseDate: new Date('2026-04-24T07:08:09.000Z'),
            },
            {
              id: 'winning-2',
              winnerId: '1002',
              createdBy: '9003',
              origin: 'Topcoder',
              category: WinningsCategory.TAAS_PAYMENT,
              title: 'TaaS payment',
              description: 'TaaS engagement payment',
              externalId: 'assignment-2',
              details: [
                {
                  status: PaymentStatus.PAID,
                  totalAmount: 900,
                  billingAccount: '80001064',
                },
              ],
              paymentStatus: {} as any,
              attributes: {},
              createdAt: new Date('2026-04-08T01:02:03.000Z'),
              updatedAt: new Date('2026-04-08T04:05:06.000Z'),
              releaseDate: new Date('2026-04-23T07:08:09.000Z'),
            },
            {
              id: 'winning-3',
              winnerId: '1003',
              createdBy: '9002',
              origin: 'Topcoder',
              category: WinningsCategory.ONE_OFF_PAYMENT,
              title: 'One-off payment',
              description: 'Non-engagement payment',
              externalId: 'task-1',
              details: [
                {
                  status: PaymentStatus.PAID,
                  totalAmount: 500,
                  billingAccount: '80001064',
                },
              ],
              paymentStatus: {} as any,
              attributes: {},
              createdAt: new Date('2026-04-08T01:02:03.000Z'),
              updatedAt: new Date('2026-04-08T04:05:06.000Z'),
              releaseDate: new Date('2026-04-23T07:08:09.000Z'),
            },
          ],
          pagination: {
            totalItems: 3,
            totalPages: 1,
            pageSize: 1000,
            currentPage: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          winnings: [],
          pagination: {
            totalItems: 0,
            totalPages: 0,
            pageSize: 1000,
            currentPage: 2,
          },
        },
      });
    tcMembersService.getHandlesByUserIds.mockResolvedValue({
      '1001': 'winner-one',
      '1002': 'winner-two',
      '1003': 'winner-three',
      '9001': 'creator-handle',
      '9003': 'taas-manager',
    });

    const output = await controller.exportWinnings(
      { type: WinningsType.PAYMENT } as WinningRequestDto,
      { id: 'admin-user', roles: ['Payment Admin'] },
    );

    expect(accessControlService.applyFilters).toHaveBeenCalledWith(
      'admin-user',
      ['Payment Admin'],
      {
        type: WinningsType.PAYMENT,
        limit: undefined,
        offset: undefined,
      },
    );
    expect(winningsRepo.searchWinnings).toHaveBeenNthCalledWith(
      1,
      {
        type: WinningsType.PAYMENT,
        limit: 1000,
        offset: 0,
      },
      {
        includeCount: false,
        includePayoutStatus: false,
        latestPaymentOnly: true,
      },
    );
    expect(tcMembersService.getHandlesByUserIds).toHaveBeenCalledWith([
      '1001',
      '1002',
      '1003',
      '9001',
      '9003',
    ]);

    const [headerRow, engagementRow, taasRow, nonEngagementRow] = output
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','));

    expect(headerRow).toEqual([
      'Winnings ID',
      'Winner ID',
      'Handle',
      'Origin',
      'Category',
      'Title',
      'Description',
      'External ID',
      'Status',
      'Total Amount',
      'Date Paid',
      'Created At',
      'Updated At',
      'Release Date',
      'Payment Creator',
      'Billing Account',
    ]);
    expect(engagementRow[14]).toBe('creator-handle');
    expect(taasRow[14]).toBe('taas-manager');
    expect(nonEngagementRow[14]).toBe('');
  });
});
