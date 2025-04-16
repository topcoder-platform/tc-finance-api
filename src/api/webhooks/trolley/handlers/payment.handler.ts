import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '../../webhooks.decorators';
import { TrolleyWebhookEvent } from '../trolley.types';

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
