import { Module } from '@nestjs/common';
import { TopcoderModule } from '../../shared/topcoder/topcoder.module';
import { ActionLogController } from './action-log.controller';
import { ActionLogService } from './action-log.service';
import { DuplicatePaymentsController } from './duplicate-payments.controller';
import { DuplicatePaymentsMonitor } from './duplicate-payments.monitor';
import { DuplicatePaymentsService } from './duplicate-payments.service';

@Module({
  imports: [TopcoderModule],
  controllers: [DuplicatePaymentsController, ActionLogController],
  providers: [
    DuplicatePaymentsService,
    DuplicatePaymentsMonitor,
    ActionLogService,
  ],
})
export class MonitoringModule {}
