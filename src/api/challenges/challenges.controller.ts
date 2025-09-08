import { Param } from '@nestjs/common';
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserInfo } from 'os';
import { M2mScope } from 'src/core/auth/auth.constants';
import { AllowedM2mScope, M2M, User } from 'src/core/auth/decorators';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { ChallengesService } from './challenges.service';

@ApiTags('Challenges')
@Controller('/challenges')
@ApiBearerAuth()
export class ChallengesController {
  constructor(
    private readonly challengesService: ChallengesService,
  ) {}

  @Post('/:challengeId')
  @M2M()
  @AllowedM2mScope(M2mScope.CreatePayments)
  @ApiOperation({
    summary: 'Create winning with payments.',
    description: 'User must have "create:payments" scope to access.',
  })
  @ApiParam({
    name: 'challengeId',
    description: 'The ID of the challenge',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  @ApiResponse({
    status: 201,
    description: 'Create winnings successfully.',
    type: ResponseDto<string>,
  })
  @HttpCode(HttpStatus.CREATED)
  async createWinnings(
    @Param('challengeId') challengeId: string,
    @User() user: UserInfo,
  ): Promise<ResponseDto<string>> {
    const result = await this.challengesService.generateChallengePayments(
      challengeId,
      user.id,
    );

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }
}
