import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Role } from 'src/core/auth/auth.constants';
import { Roles } from 'src/core/auth/decorators';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';

import {
  DuplicatePaymentReleaseDto,
  DuplicatePaymentsQueryDto,
} from './duplicate-payments.dto';
import { DuplicatePaymentsService } from './duplicate-payments.service';

/**
 * Payouts moved to Trolley in October 2025. The Trolley Logs report only
 * covers releases made from then on.
 */
export const TROLLEY_LOGS_START = new Date('2025-10-01T00:00:00Z');

@ApiTags('AdminPaymentReleases')
@Controller('/admin/payment-releases')
@ApiBearerAuth()
export class DuplicatePaymentsController {
  constructor(
    private readonly duplicatePaymentsService: DuplicatePaymentsService,
    private readonly tcMembersService: TopcoderMembersService,
  ) {}

  @Get('/duplicates')
  // backs the Wallet Admin Trolley Logs tab; not scoped by billing account
  @Roles(Role.Administrator)
  @ApiOperation({
    summary: 'Trolley Logs: pairs of payment releases that share payments',
    description:
      'Roles: Administrator. Lists pairs of active (not FAILED or RETURNED) payment releases that contain the same payments. Only releases created from October 2025 (Trolley payouts) are included.',
  })
  @ApiResponse({
    status: 200,
    description: 'Release pairs retrieved successfully.',
    type: ResponseDto<DuplicatePaymentReleaseDto[]>,
  })
  @HttpCode(HttpStatus.OK)
  async getDuplicateReleases(
    @Query() query: DuplicatePaymentsQueryDto,
  ): Promise<ResponseDto<DuplicatePaymentReleaseDto[]>> {
    const since = query.days
      ? new Date(Date.now() - query.days * 24 * 60 * 60 * 1000)
      : undefined;

    const duplicates =
      await this.duplicatePaymentsService.findDuplicateReleases({
        since,
        releasedFrom: TROLLEY_LOGS_START,
      });

    const handles = duplicates.length
      ? await this.tcMembersService.getHandlesByUserIds(
          duplicates.map((d) => d.userId),
        )
      : {};

    const result = new ResponseDto<DuplicatePaymentReleaseDto[]>();
    result.status = ResponseStatusType.SUCCESS;
    result.data = duplicates.map((d) => ({
      ...d,
      handle: handles[d.userId] ?? null,
    }));

    return result;
  }
}
