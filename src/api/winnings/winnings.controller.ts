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
}
