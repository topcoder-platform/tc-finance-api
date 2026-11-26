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

import { Role } from '../../core/auth/auth.constants';
import { Roles, User } from '../../core/auth/decorators';
import { WinningsRepository } from '../repository/winnings.repo';
import { ResponseDto, ResponseStatusType } from '../../dto/api-response.dto';
import { PaymentStatus } from '../../dto/payment.dto';
import { SearchWinningResult, WinningRequestDto } from '../../dto/winning.dto';
import { UserInfo } from '../../dto/user.type';
import { UserWinningRequestDto } from './dto/user.dto';
import { PaymentsService } from '../../shared/payments';
import { Logger } from '../../shared/global';

@ApiTags('UserWinning')
@Controller('/user')
@ApiBearerAuth()
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly winningsRepo: WinningsRepository,
    private readonly paymentsService: PaymentsService,
  ) {}

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
    if ('externalIds' in body && body.externalIds) {
      throw new BadRequestException('Search by external IDs is not supported');
    }

    if (!user.id || body.winnerId !== user.id) {
      throw new ForbiddenException('insufficient permissions');
    }

    try {
      await this.paymentsService.reconcileUserPayments(user.id);
    } catch (e) {
      this.logger.error('Error reconciling user payments', e);

      return {
        error: {
          code: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to reconcile user payments.',
        },
        status: ResponseStatusType.ERROR,
      } as ResponseDto<SearchWinningResult>;
    }

    // Member Wallet shows ON_HOLD_ADMIN task/engagement payments as "Created".
    // Include them when filtering by On Hold so those records are visible.
    const searchBody: WinningRequestDto = {
      ...body,
      status: body.status ? [body.status] : undefined,
    };
    if (body.status === PaymentStatus.ON_HOLD) {
      searchBody.status = [PaymentStatus.ON_HOLD, PaymentStatus.ON_HOLD_ADMIN];
    }

    const result = await this.winningsRepo.searchWinnings(searchBody);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }
}
