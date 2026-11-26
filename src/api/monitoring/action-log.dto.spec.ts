import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ActionLogQueryDto } from './action-log.dto';

describe('ActionLogQueryDto', () => {
  const parse = (query: Record<string, unknown>) => {
    const dto = plainToInstance(ActionLogQueryDto, query);
    return { dto, errors: validateSync(dto) };
  };

  it('accepts comma separated and repeated categories', () => {
    expect(
      parse({ categories: 'TASK_PAYMENT,CONTEST_PAYMENT' }).dto.categories,
    ).toEqual(['TASK_PAYMENT', 'CONTEST_PAYMENT']);
    expect(
      parse({ categories: ['TASK_PAYMENT', 'COPILOT_PAYMENT'] }).dto.categories,
    ).toEqual(['TASK_PAYMENT', 'COPILOT_PAYMENT']);
  });

  it('accepts the full set of filters', () => {
    const { errors } = parse({
      dateFrom: '2026-10-01T00:00:00.000Z',
      dateTo: '2026-10-31T23:59:59.999Z',
      paymentSource: 'TOPCODER',
      categories: 'TASK_PAYMENT',
      adminUserId: '88774634',
    });

    expect(errors).toEqual([]);
  });

  it.each([
    ['an unknown category', { categories: 'NOT_A_CATEGORY' }],
    ['an unknown payment source', { paymentSource: 'OTHER' }],
    ['a non numeric admin', { adminUserId: 'jdoe' }],
    ['an invalid date', { dateFrom: 'yesterday' }],
  ])('rejects %s', (_, query) => {
    expect(parse(query).errors).not.toHaveLength(0);
  });
});
