import { Provider } from '@nestjs/common';
import { PaymentHandler } from './payment.handler';
import { getWebhooksEventHandlersProvider } from '../../webhooks.event-handlers.provider';

export const TrolleyWebhookHandlers: Provider[] = [
  getWebhooksEventHandlersProvider(
    'trolleyHandlerFns',
    'TrolleyWebhookHandlers',
  ),

  PaymentHandler,
  {
    provide: 'TrolleyWebhookHandlers',
    useFactory: (paymentHandler: PaymentHandler) => [paymentHandler],
    inject: [PaymentHandler],
  },
];
