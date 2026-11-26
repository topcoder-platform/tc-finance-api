import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Role } from '../../core/auth/auth.constants';
import { Roles } from '../../core/auth/decorators';
import { ResponseDto, ResponseStatusType } from '../../dto/api-response.dto';

import {
  ACTION_LOG_MAX_DAYS,
  ActionLogEntryDto,
  ActionLogQueryDto,
} from './action-log.dto';
import { ActionLogFilters, ActionLogService } from './action-log.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the query to the service filters. An explicit `dateFrom` wins over
 * `days`; either way the range can span at most ACTION_LOG_MAX_DAYS.
 */
function toFilters(query: ActionLogQueryDto): ActionLogFilters {
  const until = query.dateTo ? new Date(query.dateTo) : undefined;
  const end = until ?? new Date();
  const since = query.dateFrom
    ? new Date(query.dateFrom)
    : new Date(end.getTime() - (query.days ?? ACTION_LOG_MAX_DAYS) * DAY_MS);

  if (since.getTime() > end.getTime()) {
    throw new BadRequestException('dateFrom must be before dateTo');
  }

  if (end.getTime() - since.getTime() > ACTION_LOG_MAX_DAYS * DAY_MS) {
    throw new BadRequestException(
      `The date range can span at most ${ACTION_LOG_MAX_DAYS} days`,
    );
  }

  return {
    since,
    until,
    paymentSource: query.paymentSource,
    categories: query.categories,
    adminUserId: query.adminUserId,
  };
}

@ApiTags('AdminActionLog')
@Controller('/admin/action-log')
@ApiBearerAuth()
export class ActionLogController {
  constructor(private readonly actionLogService: ActionLogService) {}

  @Get()
  // backs the Wallet Admin Action Log tab; not scoped by billing account
  @Roles(Role.Administrator)
  @ApiOperation({
    summary: 'Action Log: payments changed manually in Wallet Admin',
    description: `Roles: Administrator. Lists the payment status, amount, release date and description changes made in Wallet Admin, with the user ID of the admin who made them. Can be filtered by date range (at most ${ACTION_LOG_MAX_DAYS} days, the last ${ACTION_LOG_MAX_DAYS} days by default), payment source, payment category and admin.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Action log retrieved successfully.',
    type: ResponseDto<ActionLogEntryDto[]>,
  })
  @HttpCode(HttpStatus.OK)
  async getActionLog(
    @Query() query: ActionLogQueryDto,
  ): Promise<ResponseDto<ActionLogEntryDto[]>> {
    const filters = toFilters(query);

    const result = new ResponseDto<ActionLogEntryDto[]>();
    result.status = ResponseStatusType.SUCCESS;
    result.data = await this.actionLogService.findActions(filters);

    return result;
  }

  @Get('/admins')
  @Roles(Role.Administrator)
  @ApiOperation({
    summary: 'Action Log: admins who have changed payments in Wallet Admin',
    description:
      'Roles: Administrator. User IDs of every admin with at least one Wallet Admin payment change, for the Action Log "Actioned by" filter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin user IDs retrieved successfully.',
    type: ResponseDto<string[]>,
  })
  @HttpCode(HttpStatus.OK)
  async getActionLogAdmins(): Promise<ResponseDto<string[]>> {
    const result = new ResponseDto<string[]>();
    result.status = ResponseStatusType.SUCCESS;
    result.data = await this.actionLogService.findAdminUserIds();

    return result;
  }
}
