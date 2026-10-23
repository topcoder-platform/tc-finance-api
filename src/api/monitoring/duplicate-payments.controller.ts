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

@ApiTags('AdminPaymentReleases')
@Controller('/admin/payment-releases')
@ApiBearerAuth()
export class DuplicatePaymentsController {
  constructor(
    private readonly duplicatePaymentsService: DuplicatePaymentsService,
    private readonly tcMembersService: TopcoderMembersService,
  ) {}

  @Get('/duplicates')
  // not scoped by billing account, so restricted to roles that see all payments
  @Roles(Role.PaymentAdmin)
  @ApiOperation({
    summary: 'Report payment releases that contain the same payments',
    description:
      'Roles: Payment Admin. Lists pairs of active (not FAILED or RETURNED) payment releases that share payments, i.e. payments that were withdrawn more than once.',
  })
  @ApiResponse({
    status: 200,
    description: 'Duplicate payment releases retrieved successfully.',
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
      await this.duplicatePaymentsService.findDuplicateReleases({ since });

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
