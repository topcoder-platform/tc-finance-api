import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserInfo } from 'src/dto/user.type';
import { M2mScope } from 'src/core/auth/auth.constants';
import { AllowedM2mScope, M2M, User } from 'src/core/auth/decorators';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';
import { ChallengesService } from './challenges.service';

@ApiTags('Challenges')
@Controller('/challenges')
@ApiBearerAuth()
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Post('/:challengeId')
  @M2M()
  @AllowedM2mScope(M2mScope.CreatePayments)
  @ApiOperation({
    summary: 'Create all winnings with payments for a challenge.',
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
    if (!isUUID(challengeId)) {
      throw new BadRequestException(
        'Invalid challengeId provided! Uuid expected!',
      );
    }

    const result = new ResponseDto<string>();

    try {
      await this.challengesService.generateChallengePayments(
        challengeId,
        user.id,
      );
      result.status = ResponseStatusType.SUCCESS;
    } catch (e) {
      result.error = {
        ...e,
        message: e.message,
      };
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }
}
