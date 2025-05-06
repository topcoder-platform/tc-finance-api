import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Body,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

import { Role } from 'src/core/auth/auth.constants';
import { Roles, User } from 'src/core/auth/decorators';
import { UserInfo } from 'src/dto/user.type';
import { ResponseDto, ResponseStatusType } from 'src/dto/api-response.dto';

import { WithdrawalService } from './withdrawal.service';
import { WithdrawRequestDto } from './dto/withdraw.dto';

@ApiTags('Withdrawal')
@Controller('/withdraw')
@ApiBearerAuth()
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post()
  @Roles(Role.User)
  @ApiOperation({
    summary: 'User call this operation to process withdrawal.',
    description: 'jwt required.',
  })
  @ApiBody({
    description: 'Request body',
    type: WithdrawRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Operation successful.',
    type: ResponseDto<string>,
  })
  @HttpCode(HttpStatus.OK)
  async doWithdraw(
    @User() user: UserInfo,
    @Body() body: WithdrawRequestDto,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    try {
      await this.withdrawalService.withdraw(
        user.id,
        user.handle,
        body.paymentIds,
      );
      result.status = ResponseStatusType.SUCCESS;
      return result;
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }
}
