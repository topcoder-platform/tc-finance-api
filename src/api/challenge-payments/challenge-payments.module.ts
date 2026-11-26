import { Module } from '@nestjs/common';
import { ChallengePaymentsController } from './challenge-payments.controller';
import { ChallengePaymentsService } from './challenge-payments.service';
import { TopcoderModule } from '../../shared/topcoder/topcoder.module';

@Module({
  imports: [TopcoderModule],
  controllers: [ChallengePaymentsController],
  providers: [ChallengePaymentsService],
})
export class ChallengePaymentsModule {}
