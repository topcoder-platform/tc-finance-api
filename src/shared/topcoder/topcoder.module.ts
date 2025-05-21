import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { TopcoderChallengesService } from './challenges.service';

@Module({
  providers: [
    TopcoderChallengesService,
    TopcoderMembersService,
    TopcoderM2MService,
  ],
  exports: [TopcoderChallengesService, TopcoderMembersService],
})
export class TopcoderModule {}
