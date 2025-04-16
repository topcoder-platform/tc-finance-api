import { Module } from '@nestjs/common';
import { TrolleyService } from './trolley.service';
import { WebhooksController } from './webhooks.controller';
import { TrolleyWebhookHandlersProviders } from './trolley-handlers';

@Module({
  imports: [],
  controllers: [WebhooksController],
  providers: [...TrolleyWebhookHandlersProviders, TrolleyService],
})
export class WebhooksModule {}
