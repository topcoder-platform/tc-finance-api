jest.mock('./duplicate-payments.service', () => ({
  DuplicatePaymentsService: class {},
}));

jest.mock('src/shared/topcoder/members.service', () => ({
  TopcoderMembersService: class {},
}));

import { ROLES_KEY } from 'src/core/auth/decorators/roles.decorator';
import { DuplicatePaymentsController } from './duplicate-payments.controller';

describe('DuplicatePaymentsController', () => {
  let duplicatePaymentsService: { findDuplicateReleases: jest.Mock };
  let tcMembersService: { getHandlesByUserIds: jest.Mock };
  let controller: DuplicatePaymentsController;

  const row = {
    userId: '500021412',
    release1Id: 'a0d1b0c8-18e2-47b1-b3bf-1093fe9068b6',
    release2Id: '0cdd624c-7a7b-4851-99ba-1af52e807938',
  };

  beforeEach(() => {
    duplicatePaymentsService = {
      findDuplicateReleases: jest.fn().mockResolvedValue([row]),
    };
    tcMembersService = {
      getHandlesByUserIds: jest
        .fn()
        .mockResolvedValue({ '500021412': 'sreekarReddy07' }),
    };
    controller = new DuplicatePaymentsController(
      duplicatePaymentsService as any,
      tcMembersService as any,
    );
  });

  it('is restricted to Payment Admin', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      DuplicatePaymentsController.prototype.getDuplicateReleases,
    );

    expect(roles).toEqual(['Payment Admin']);
  });

  it('returns the whole history with member handles when no days are given', async () => {
    const result = await controller.getDuplicateReleases({});

    expect(duplicatePaymentsService.findDuplicateReleases).toHaveBeenCalledWith(
      { since: undefined },
    );
    expect(result.status).toBe('success');
    expect(result.data).toEqual([{ ...row, handle: 'sreekarReddy07' }]);
  });

  it('limits the report to the last N days', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-23T00:00:00Z') });

    await controller.getDuplicateReleases({ days: 7 });

    expect(duplicatePaymentsService.findDuplicateReleases).toHaveBeenCalledWith(
      { since: new Date('2026-10-16T00:00:00Z') },
    );
    jest.useRealTimers();
  });

  it('returns a null handle when the member lookup has no match', async () => {
    tcMembersService.getHandlesByUserIds.mockResolvedValueOnce({});

    const result = await controller.getDuplicateReleases({});

    expect(result.data[0].handle).toBeNull();
  });

  it('skips the member lookup when there are no duplicates', async () => {
    duplicatePaymentsService.findDuplicateReleases.mockResolvedValueOnce([]);

    const result = await controller.getDuplicateReleases({});

    expect(tcMembersService.getHandlesByUserIds).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
  });
});
