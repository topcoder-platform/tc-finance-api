import { Provider } from '@nestjs/common';
import { PaymentHandler } from './payment.handler';
import { TaxFormHandler } from './tax-form.handler';
import { getWebhooksEventHandlersProvider } from '../../webhooks.event-handlers.provider';
import { RecipientAccountHandler } from './recipient-account.handler';

export const TrolleyWebhookHandlers: Provider[] = [
  getWebhooksEventHandlersProvider(
    'trolleyHandlerFns',
    'TrolleyWebhookHandlers',
  ),

  PaymentHandler,
  RecipientAccountHandler,
  TaxFormHandler,
  {
    provide: 'TrolleyWebhookHandlers',
    inject: [PaymentHandler, RecipientAccountHandler, TaxFormHandler],
    useFactory: (
      paymentHandler: PaymentHandler,
      recipientAccountHandler: RecipientAccountHandler,
      taxFormHandler: TaxFormHandler,
    ) => [paymentHandler, recipientAccountHandler, taxFormHandler],
  },
];
