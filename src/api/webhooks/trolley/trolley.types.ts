export enum TrolleyWebhookEvent {
  paymentCreated = 'payment.created',
  paymentUpdated = 'payment.updated',
  taxFormStatusUpdated = 'taxForm.status_updated',
}

export type TrolleyEventHandler = (eventPayload: any) => Promise<unknown>;

export type TaxFormStatus = 'incomplete' | 'submitted' | 'reviewed' | 'voided';

export interface TaxFormStatusUpdatedEventData {
  recipientId: string;
  taxFormId: string;
  status: TaxFormStatus;
  taxFormType: string;
  taxFormAddressCountry: string;
  mailingAddressCountry: null;
  registrationCountry: null;
  createdAt: string;
  signedAt: string;
  reviewedAt: string;
  reviewedBy: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  tinStatus: string;
}

export interface TaxFormStatusUpdatedEvent {
  taxForm: {
    previousFields: {
      status: TaxFormStatus;
    };
    data: TaxFormStatusUpdatedEventData;
  };
}
