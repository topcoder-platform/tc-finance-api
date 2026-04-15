import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { TopcoderChallengesService } from './challenges.service';
import { TopcoderEngagementsService } from './engagements.service';
import { TopcoderBusService } from './bus.service';
import { TopcoderEmailService } from './tc-email.service';
import { BillingAccountsService } from './billing-accounts.service';

@Module({
  providers: [
    TopcoderChallengesService,
    TopcoderEngagementsService,
    TopcoderMembersService,
    TopcoderM2MService,
    TopcoderBusService,
    TopcoderEmailService,
    BillingAccountsService,
  ],
  exports: [
    TopcoderChallengesService,
    TopcoderEngagementsService,
    TopcoderMembersService,
    TopcoderM2MService,
    TopcoderBusService,
    TopcoderEmailService,
    BillingAccountsService,
  ],
})
export class TopcoderModule {}
