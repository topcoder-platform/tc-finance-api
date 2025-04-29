import { RecipientAccountWebhookEvent } from './handlers/recipient-account.types';
import { TaxFormWebhookEvent } from './handlers/tax-form.types';

export type TrolleyWebhookEvent =
  | RecipientAccountWebhookEvent
  | TaxFormWebhookEvent;

export type TrolleyEventHandler = (eventPayload: any) => Promise<unknown>;
