import { Module } from '@nestjs/common';
import { TopcoderMembersService } from './members.service';

@Module({
  providers: [TopcoderMembersService],
  exports: [TopcoderMembersService],
})
export class TopcoderModule {}
