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

import {
  ACTION_LOG_MAX_DAYS,
  ActionLogEntryDto,
  ActionLogQueryDto,
} from './action-log.dto';
import { ActionLogService } from './action-log.service';

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
    description: `Roles: Administrator. Lists the payment status, amount, release date and description changes made in Wallet Admin, with the user ID of the admin who made them. Covers at most the last ${ACTION_LOG_MAX_DAYS} days.`,
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
    const days = query.days ?? ACTION_LOG_MAX_DAYS;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = new ResponseDto<ActionLogEntryDto[]>();
    result.status = ResponseStatusType.SUCCESS;
    result.data = await this.actionLogService.findActions(since);

    return result;
  }
}
