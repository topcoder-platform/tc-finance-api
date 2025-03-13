import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Role } from 'src/core/auth/auth.constants';
import { Roles, User } from 'src/core/auth/decorators';
import { UserInfo } from 'src/dto/user.dto';
import { ResponseStatusType, ResponseDto } from 'src/dto/adminWinning.dto';
import { WalletDetailDto } from 'src/dto/wallet.dto';

import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('/wallet')
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer)
  @ApiOperation({
    summary: 'Get wallet details. Will get user id from jwt token.',
    description: 'jwt required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Get wallet detail successfully.',
    type: ResponseDto<WalletDetailDto>,
  })
  @HttpCode(HttpStatus.OK)
  async getWallet(
    @User() user: UserInfo,
  ): Promise<ResponseDto<WalletDetailDto>> {
    const result = await this.walletService.getWalletDetails(user.id);
    if (result.error) {
      result.status = ResponseStatusType.ERROR;
    }

    result.status = ResponseStatusType.SUCCESS;

    return result;
  }
}
