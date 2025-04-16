export enum TrolleyWebhookEvent {
  paymentCreated = 'payment.created',
  paymentUpdated = 'payment.updated',
}

export type TrolleyEventHandler = (eventPayload: any) => Promise<unknown>;
