import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { M2mScope } from 'src/core/auth/auth.constants';
import { M2M, AllowedM2mScope, User } from 'src/core/auth/decorators';
import { UserInfo } from 'src/dto/user.dto';
import {
  ResponseStatusType,
  ResponseDto,
  WinningRequestDto,
  SearchWinningResult,
  WinningCreateRequestDto,
} from 'src/dto/adminWinning.dto';

import { AdminWinningService } from '../admin-winning/adminWinning.service';
import { WinningService } from './winning.service';

@ApiTags('Winning')
@Controller('/winnings')
@ApiBearerAuth()
export class WinningController {
  constructor(
    private readonly winningService: WinningService,
    private readonly adminWinningService: AdminWinningService,
  ) {}

  @Post()
  @M2M()
  @AllowedM2mScope(M2mScope.CreatePayments)
  @ApiOperation({
    summary: 'Create winning with payments.',
    description: 'User must have "create:payments" scope to access.',
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
    const result = await this.winningService.createWinningWithPayments(
      body,
      user.id,
    );
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

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
    type: ResponseDto<SearchWinningResult>,
  })
  @HttpCode(HttpStatus.OK)
  async searchWinnings(
    @Body() body: WinningRequestDto,
  ): Promise<ResponseDto<SearchWinningResult>> {
    const result = await this.adminWinningService.searchWinnings(body);

    result.status = result.error
      ? ResponseStatusType.ERROR
      : ResponseStatusType.SUCCESS;

    return result;
  }
}
