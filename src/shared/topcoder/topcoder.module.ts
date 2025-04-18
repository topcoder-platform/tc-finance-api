import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';
import { TopcoderM2MService } from './topcoder-m2m.service';

@Module({
  providers: [TopcoderMembersService, TopcoderM2MService],
  exports: [TopcoderMembersService],
})
export class TopcoderModule {}
