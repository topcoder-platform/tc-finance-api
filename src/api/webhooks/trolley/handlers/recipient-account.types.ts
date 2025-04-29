export enum RecipientAccountWebhookEvent {
  created = 'recipientAccount.created',
  updated = 'recipientAccount.updated',
  deleted = 'recipientAccount.deleted',
}

export interface RecipientAccountEventData {
  status: string;
  type: string;
  primary: boolean;
  currency: string;
  id: string;
  recipientId: string;
  recipientAccountId: string;
  disabledAt: string | null;
  recipientReferenceId: string | null;
  deliveryBusinessDaysEstimate: number;
  country: string;
  iban: string;
  accountNum: string;
  bankAccountType: string | null;
  bankCodeMappingId: string | null;
  accountHolderName: string;
  swiftBic: string;
  branchId: string;
  bankId: string;
  bankName: string;
  bankAddress: string;
  bankCity: string;
  bankRegionCode: string;
  bankPostalCode: string;
  routeType: string;
  recipientFees: string;
}

export type RecipientAccountDeleteEventData = Pick<
  RecipientAccountEventData,
  'id'
>;
