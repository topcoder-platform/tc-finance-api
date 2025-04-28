import { Provider } from '@nestjs/common';
import { PaymentHandler } from './payment.handler';
import { TaxFormHandler } from './tax-form.handler';
import { getWebhooksEventHandlersProvider } from '../../webhooks.event-handlers.provider';

export const TrolleyWebhookHandlers: Provider[] = [
  getWebhooksEventHandlersProvider(
    'trolleyHandlerFns',
    'TrolleyWebhookHandlers',
  ),

  PaymentHandler,
  TaxFormHandler,
  {
    provide: 'TrolleyWebhookHandlers',
    inject: [PaymentHandler, TaxFormHandler],
    useFactory: (
      paymentHandler: PaymentHandler,
      taxFormHandler: TaxFormHandler,
    ) => [paymentHandler, taxFormHandler],
  },
];
