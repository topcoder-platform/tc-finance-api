jest.mock('src/config', () => ({
  ENV_CONFIG: {
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    error = jest.fn();
  },
}));

import { TopcoderEngagementsService } from './engagements.service';

describe('TopcoderEngagementsService', () => {
  let m2MService: { m2mFetch: jest.Mock };
  let service: TopcoderEngagementsService;

  beforeEach(() => {
    m2MService = { m2mFetch: jest.fn() };
    service = new TopcoderEngagementsService(m2MService as any);
  });

  it('encodes an untrusted assignment id as one URL path segment', async () => {
    m2MService.m2mFetch.mockResolvedValue({ assignmentId: 'assignment-id' });

    await service.getAssignmentContextById(
      'assignment/../../admin?scope=*#fragment',
    );

    expect(m2MService.m2mFetch).toHaveBeenCalledWith(
      'https://api.topcoder-dev.com/v6/engagements/engagements/assignments/assignment%2F..%2F..%2Fadmin%3Fscope%3D*%23fragment/context',
    );
  });

  it('encodes an untrusted engagement id as one URL path segment', async () => {
    m2MService.m2mFetch.mockResolvedValue({ id: 'engagement-id' });

    await service.getEngagementById('engagement/../admin?scope=*#fragment');

    expect(m2MService.m2mFetch).toHaveBeenCalledWith(
      'https://api.topcoder-dev.com/v6/engagements/engagements/engagement%2F..%2Fadmin%3Fscope%3D*%23fragment',
    );
  });
});
