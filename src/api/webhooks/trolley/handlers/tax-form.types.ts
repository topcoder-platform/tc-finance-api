export enum TaxFormWebhookEvent {
  statusUpdated = 'taxForm.status_updated',
}

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
  previousFields: {
    status: TrolleyTaxFormStatus;
  };
  data: TaxFormStatusUpdatedEventData;
}
