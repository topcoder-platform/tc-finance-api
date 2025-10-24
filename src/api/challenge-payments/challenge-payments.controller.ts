import {
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowedM2mScope, Roles, User } from 'src/core/auth/decorators';
import { M2mScope, Role } from 'src/core/auth/auth.constants';
import { UserInfo } from 'src/dto/user.type';
import { ChallengePaymentsService } from './challenge-payments.service';

@ApiTags('Payments')
@Controller('/challenge-payments')
@ApiBearerAuth()
export class ChallengePaymentsController {
  constructor(
    private readonly challengePaymentsService: ChallengePaymentsService,
  ) {}

  @Get('/:challengeId')
  @AllowedM2mScope(M2mScope.ReadPayments, M2mScope.CreatePayments)
  @Roles(Role.PaymentAdmin, Role.PaymentEditor, Role.PaymentViewer, Role.User)
  @ApiOperation({
    summary:
      'List payments (winnings) for a challenge with role-aware filtering',
  })
  async getChallengePayments(
    @Param('challengeId') challengeId: string,
    @Query('winnerOnly') winnerOnly: string | undefined,
    @User() user: UserInfo,
    @Req() req: any,
  ) {
    return this.challengePaymentsService.listChallengePayments({
      challengeId,
      requestUserId: user?.id,
      isMachineToken: Boolean(req?.m2mTokenScope),
      winnerOnly: (winnerOnly || '').toLowerCase() === 'true',
      auth0User: req?.auth0User,
    });
  }
}
