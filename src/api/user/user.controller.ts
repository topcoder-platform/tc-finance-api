import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Role } from 'src/core/auth/auth.constants';
import { Roles, User } from 'src/core/auth/decorators';
import { WinningsRepository } from '../repository/winnings.repo';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { SearchWinningResult, WinningRequestDto } from 'src/dto/winning.dto';
import { UserInfo } from 'src/dto/user.type';
import { UserWinningRequestDto } from './dto/user.dto';

@ApiTags('UserWinning')
@Controller('/user')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly winningsRepo: WinningsRepository) {}

  @Post('/winnings')
  @Roles(Role.User)
  @ApiOperation({
    summary: 'List user winnings with pagination parameters',
    description:
      'User id in jwt must equal to winnerId in request body. jwt required',
  })
  @ApiBody({
    description: 'Winning request body',
    type: UserWinningRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Search winnings successfully.',
    type: ResponseDto<SearchWinningResult>,
  })
  @HttpCode(HttpStatus.OK)
  async searchUserWinnings(
    @Body() body: UserWinningRequestDto,
    @User() user: UserInfo,
  ): Promise<ResponseDto<SearchWinningResult>> {
    if ((body as WinningRequestDto).externalIds) {
      throw new BadRequestException('Search by external IDs is not supported');
    }

    if (!user.id || body.winnerId !== user.id) {
      throw new ForbiddenException('insufficient permissions');
    }

    const result = await this.winningsRepo.searchWinnings(
      body as WinningRequestDto,
    );
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }
}
