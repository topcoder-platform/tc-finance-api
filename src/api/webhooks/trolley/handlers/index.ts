import { Provider } from '@nestjs/common';
import { PaymentHandler } from './payment.handler';
import { TaxFormHandler } from './tax-form.handler';
import { getWebhooksEventHandlersProvider } from '../../webhooks.event-handlers.provider';
import { RecipientAccountHandler } from './recipient-account.handler';
import { RecipientVerificationHandler } from './recipient-verification.handler';

export const TrolleyWebhookHandlers: Provider[] = [
  getWebhooksEventHandlersProvider(
    'trolleyHandlerFns',
    'TrolleyWebhookHandlers',
  ),

  PaymentHandler,
  RecipientAccountHandler,
  RecipientVerificationHandler,
  TaxFormHandler,
  {
    provide: 'TrolleyWebhookHandlers',
    inject: [
      PaymentHandler,
      RecipientAccountHandler,
      RecipientVerificationHandler,
      TaxFormHandler,
    ],
    useFactory: (
      paymentHandler: PaymentHandler,
      recipientAccountHandler: RecipientAccountHandler,
      recipientVerificationHandler: RecipientVerificationHandler,
      taxFormHandler: TaxFormHandler,
    ) => [
      paymentHandler,
      recipientAccountHandler,
      recipientVerificationHandler,
      taxFormHandler,
    ],
  },
];
