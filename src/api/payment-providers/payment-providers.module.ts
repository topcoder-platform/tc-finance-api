import { Module } from '@nestjs/common';
import { TopcoderModule } from 'src/shared/topcoder/topcoder.module';
import { TrolleyController } from './trolley.controller';
import { TrolleyService } from './trolley.service';

@Module({
  imports: [TopcoderModule],
  controllers: [TrolleyController],
  providers: [TrolleyService],
})
export class PaymentProvidersModule {}
