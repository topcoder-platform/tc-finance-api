import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { TopcoderChallengesService } from './challenges.service';
import { TopcoderBusService } from './bus.service';
import { TopcoderEmailService } from './tc-email.service';

@Module({
  providers: [
    TopcoderChallengesService,
    TopcoderMembersService,
    TopcoderM2MService,
    TopcoderBusService,
    TopcoderEmailService,
  ],
  exports: [
    TopcoderChallengesService,
    TopcoderMembersService,
    TopcoderBusService,
    TopcoderEmailService,
  ],
})
export class TopcoderModule {}
