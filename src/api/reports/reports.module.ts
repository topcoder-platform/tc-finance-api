import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';

@Module({
  imports: [TopcoderModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
