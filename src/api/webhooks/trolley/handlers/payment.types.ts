export enum PaymentWebhookEvent {
  processed = 'payment.processed',
  failed = 'payment.failed',
  returned = 'payment.returned',
}

export enum PaymentProcessedEventStatus {
  PROCESSED = 'processed',
  FAILED = 'failed',
  RETURNED = 'returned',
}

export interface PaymentProcessedEventData {
  id: string;
  recipient: {
    id: string;
    referenceId: string;
    email: string;
  };
  status: PaymentProcessedEventStatus;
  externalId?: string;
  sourceAmount: string; // gross amount
  fees: string;
  targetAmount: string; // net amount
  failureMessage: string | null;
  errors?: string[];
  returnedNote?: string;
  memo: string | null;
  batch: {
    id: string;
  };
}
