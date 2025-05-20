import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';
import { TopcoderM2MService } from './topcoder-m2m.service';
import { TopcoderCallengesService } from './challenges.service';

@Module({
  providers: [
    TopcoderCallengesService,
    TopcoderMembersService,
    TopcoderM2MService,
  ],
  exports: [TopcoderCallengesService, TopcoderMembersService],
})
export class TopcoderModule {}
