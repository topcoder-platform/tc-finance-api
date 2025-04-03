export enum UserPaymentMethodStatus {
  UserPaymentMethodStatusOtpVerified = 'OTP_VERIFIED',
  UserPaymentMethodStatusOtpPending = 'OTP_PENDING',
  UserPaymentMethodStatusConnected = 'CONNECTED',
  UserPaymentMethodStatusInactive = 'INACTIVE',
}

export class PaymentMethodQueryResult {
  payment_method_id: string;
  payment_method_type: string;
  name: string;
  description: string | null;
  status: string;
  id: string;
}
