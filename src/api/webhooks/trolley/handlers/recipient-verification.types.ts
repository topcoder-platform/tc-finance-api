export enum RecipientVerificationWebhookEvent {
  statusUpdated = 'recipientVerification.status_updated',
}

export interface RecipientVerificationStatusUpdateEventData {
  type: string;
  recipientId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decisionAt: string | null;
  id: string;
  reasonType: string | null;
  verifiedData: {
    channel: 'sms' | 'email';
    phone: string;
    phoneExtension: string | null;
    country: string;
  };
}
