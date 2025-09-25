export enum RecipientVerificationWebhookEvent {
  statusUpdated = 'recipientVerification.status_updated',
}

export enum RecipientVerificationType {
  phone = 'phone',
  individual = 'individual',
}

interface VerifiedIdentityData {
  dob: string;
  reason: string | null;
  address: {
    city: string;
    region: string;
    country: string;
    street1: string;
    street2: string;
    postalCode: string;
  };
  lastName: string;
  firstName: string;
  documentType: string;
  matchSignals: {
    yobMatch: boolean;
    countryMatch: boolean;
    postalCodeMatch: boolean | null;
  };
  ageWhenVerified: number;
  documentValidFrom: string | null;
  documentValidUntil: string | null;
  documentIssuingCountry: string;
}

interface VerifiedPhoneData {
  phone: string;
  channel: 'sms' | 'call';
  country: string;
  phoneExtension: string | null;
}

export interface RecipientVerificationStatusUpdateEventData {
  type: RecipientVerificationType;
  recipientId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decisionAt: string | null;
  id: string;
  reasonType: string | null;
  verifiedData: VerifiedIdentityData | VerifiedPhoneData;
}
