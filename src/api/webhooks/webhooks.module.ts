import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TrolleyService } from './trolley/trolley.service';
import { TrolleyWebhookHandlers } from './trolley/handlers';

@Module({
  imports: [],
  controllers: [WebhooksController],
  providers: [...TrolleyWebhookHandlers, TrolleyService],
})
export class WebhooksModule {}
