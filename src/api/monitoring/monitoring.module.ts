import { Module } from '@nestjs/common';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { DuplicatePaymentsController } from './duplicate-payments.controller';
import { DuplicatePaymentsMonitor } from './duplicate-payments.monitor';
import { DuplicatePaymentsService } from './duplicate-payments.service';

@Module({
  imports: [TopcoderModule],
  controllers: [DuplicatePaymentsController],
  providers: [DuplicatePaymentsService, DuplicatePaymentsMonitor],
})
export class MonitoringModule {}
