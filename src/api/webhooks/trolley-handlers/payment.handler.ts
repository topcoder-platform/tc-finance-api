import { Injectable } from '@nestjs/common';
import { TrolleyWebhookEvent } from '../webhooks.types';
import { WebhookEvent } from './decorators';

@Injectable()
export class PaymentHandler {
  @WebhookEvent(TrolleyWebhookEvent.paymentCreated)
  async handlePaymentCreated(payload: any): Promise<any> {
    // TODO: Build out logic for payment.created event
    console.log('handling', TrolleyWebhookEvent.paymentCreated);

  }

  @WebhookEvent(TrolleyWebhookEvent.paymentUpdated)
  async handlePaymentUpdated(payload: any): Promise<any> {
    // TODO: Build out logic for payment.updated event
    console.log('handling', TrolleyWebhookEvent.paymentUpdated);
  }
}
