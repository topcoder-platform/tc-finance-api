import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Role } from '../../core/auth/auth.constants';
import { Roles, User } from '../../core/auth/decorators';
import { UserInfo } from '../../dto/user.type';
import { ResponseDto, ResponseStatusType } from '../../dto/api-response.dto';
import {
  WalletDetailDto,
  walletDetailResponseExample,
} from '../../dto/wallet.dto';

import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('/wallet')
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(
    Role.PaymentAdmin,
    Role.WiproTaasAdmin,
    Role.PaymentEditor,
    Role.PaymentViewer,
    Role.User,
  )
  @ApiOperation({
    summary: 'Get wallet details. Will get user id from jwt token.',
    description: 'jwt required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Get wallet detail successfully.',
    type: ResponseDto<WalletDetailDto>,
    example: {
      data: walletDetailResponseExample,
      status: 'success',
    },
  })
  @HttpCode(HttpStatus.OK)
  async getWallet(
    @User() user: UserInfo,
  ): Promise<ResponseDto<WalletDetailDto>> {
    const result = await this.walletService.getWalletDetails(user.id);

    result.status = ResponseStatusType.SUCCESS;
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    return result;
  }
}
