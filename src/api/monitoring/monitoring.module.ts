import { Module } from '@nestjs/common';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { DuplicatePaymentsMonitor } from './duplicate-payments.monitor';

@Module({
  imports: [TopcoderModule],
  providers: [DuplicatePaymentsMonitor],
})
export class MonitoringModule {}
