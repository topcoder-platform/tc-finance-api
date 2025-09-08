import { Module } from '@nestjs/common';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { WinningsModule } from '../winnings/winnings.module';
import { WinningsRepository } from '../repository/winnings.repo';

@Module({
  imports: [TopcoderModule, WinningsModule],
  controllers: [ChallengesController],
  providers: [
    ChallengesService,
    WinningsRepository,
  ],
})
export class ChallengesModule {}
