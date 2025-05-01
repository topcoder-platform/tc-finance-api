import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TrolleyService } from './trolley/trolley.service';
import { TrolleyWebhookHandlers } from './trolley/handlers';
import { PaymentsModule } from 'src/shared/payments';

@Module({
  imports: [PaymentsModule],
  controllers: [WebhooksController],
  providers: [...TrolleyWebhookHandlers, TrolleyService],
})
export class WebhooksModule {}
