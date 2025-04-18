import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TrolleyService } from './trolley.service';
import { Roles, User } from 'src/core/auth/decorators';
import { UserInfo } from 'src/dto/user.dto';
import { Role } from 'src/core/auth/auth.constants';
import { ResponseDto } from 'src/dto/adminWinning.dto';

@ApiTags('PaymentProviders')
@Controller('/trolley')
@ApiBearerAuth()
export class TrolleyController {
  constructor(private readonly trolleyService: TrolleyService) {}

  @Get('/portal-link')
  @Roles(Role.User)
  @ApiOperation({
    summary: 'Get the Trolley portal link for the current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Trolley portal link',
    type: ResponseDto<{ link: string; recipientId: string }>,
  })
  @HttpCode(HttpStatus.OK)
  async getPortalUrl(@User() user: UserInfo) {
    return this.trolleyService.getPortalUrlForUser(user);
  }
}
