import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { M2mScope, Role } from 'src/core/auth/auth.constants';
import { AllowedM2mScope, User, Roles, M2M } from 'src/core/auth/decorators';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { UserInfo } from 'src/dto/user.type';
import {
  WinningCreateRequestDto,
  WinningRequestDto,
  WinningDto,
} from 'src/dto/winning.dto';
import { WinningsService } from './winnings.service';
import { WinningsRepository } from '../repository/winnings.repo';

@ApiTags('Winning')
@Controller('/winnings')
@ApiBearerAuth()
export class WinningsController {
  constructor(
    private readonly winningsService: WinningsService,
    private readonly winningsRepo: WinningsRepository,
  ) {}

  @Post()
  @AllowedM2mScope(M2mScope.CreatePayments)
  @Roles(
    Role.PaymentAdmin,
    Role.PaymentEditor,
    Role.TaskManager,
    Role.TalentManager,
    Role.ProjectManager,
  )
  @ApiOperation({
    summary: 'Create winning with payments.',
    description:
      'User must have "create:payments" scope or Payment Admin, Payment Editor, Project Manager, Task Manager, or Talent Manager role to access.',
  })
  @ApiBody({
    description: 'Winning request body',
    type: WinningCreateRequestDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Create winnings successfully.',
    type: ResponseDto<string>,
  })
  @HttpCode(HttpStatus.CREATED)
  async createWinnings(
    @Body() body: WinningCreateRequestDto,
    @User() user: UserInfo,
  ): Promise<ResponseDto<string>> {
    const result = await this.winningsService.createWinningWithPayments(
      body,
      user.id,
    );

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }

  @Post('/list')
  @M2M()
  @AllowedM2mScope(M2mScope.CreatePayments, M2mScope.ReadPayments)
  @ApiOperation({
    summary: 'Search winning with parameters.',
    description: 'User must have "read:payments" scope to access.',
  })
  @ApiBody({
    description: 'Winning request body',
    type: WinningRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Search winnings successfully.',
    type: ResponseDto<WinningDto[]>,
  })
  @HttpCode(HttpStatus.OK)
  async searchWinnings(
    @Body() body: WinningRequestDto,
  ): Promise<ResponseDto<WinningDto[]>> {
    const result = await this.winningsRepo.searchWinnings(body);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return {
      ...result,
      data: result.data.winnings,
    };
  }

  @Get('/by-external-id/:externalId')
  @AllowedM2mScope(M2mScope.ReadPayments)
  @Roles(
    Role.Administrator,
    Role.TalentManager,
    Role.ProjectManager,
    Role.PaymentAdmin,
  )
  @ApiOperation({
    summary: 'Get winnings by external ID',
    description:
      "User must have 'read:payments' scope or Administrator, Talent Manager, Project Manager, or Payment Admin role to access.",
  })
  @ApiParam({
    name: 'externalId',
    description: 'The external ID to filter winnings',
    example: 'assignment-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Retrieved winnings successfully.',
    type: ResponseDto<WinningDto[]>,
  })
  @HttpCode(HttpStatus.OK)
  async getWinningsByExternalId(
    @Param('externalId') externalId: string,
  ): Promise<ResponseDto<WinningDto[]>> {
    const result = await this.winningsRepo.getWinningsByExternalId(externalId);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return {
      ...result,
      data: result.data,
    };
  }
}
