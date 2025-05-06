export enum PaymentWebhookEvent {
  processed = 'payment.processed',
  failed = 'payment.failed',
  returned = 'payment.returned',
}

export interface PaymentProcessedEventData {
  id: string;
  recipient: {
    id: string;
    referenceId: string;
    email: string;
  };
  status: 'processed' | 'failed' | 'returned';
  externalId?: string;
  sourceAmount: string; // gross amount
  fees: string;
  targetAmount: string; // net amount
  failureMessage: string | null;
  memo: string | null;
  batch: {
    id: string;
  };
}
