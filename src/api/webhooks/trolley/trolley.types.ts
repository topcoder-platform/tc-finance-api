export enum TrolleyWebhookEvent {
  paymentCreated = 'payment.created',
  paymentUpdated = 'payment.updated',
  taxFormStatusUpdated = 'taxForm.status_updated',
}

export type TrolleyEventHandler = (eventPayload: any) => Promise<unknown>;

export enum TrolleyTaxFormStatus {
  Incomplete = 'incomplete',
  Submitted = 'submitted',
  Reviewed = 'reviewed',
  Voided = 'voided',
}

export interface TaxFormStatusUpdatedEventData {
  recipientId: string;
  taxFormId: string;
  status: TrolleyTaxFormStatus;
  taxFormType: string;
  taxFormAddressCountry: string;
  mailingAddressCountry: string | null;
  registrationCountry: string | null;
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
      status: TrolleyTaxFormStatus;
    };
    data: TaxFormStatusUpdatedEventData;
  };
}
