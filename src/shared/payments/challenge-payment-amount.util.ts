import { Prisma } from '@prisma/client';

type PaymentAmountValue = Prisma.Decimal | number | string | null | undefined;

export interface ChallengePaymentBudgetAmount {
  grossAmount?: PaymentAmountValue;
  totalAmount?: PaymentAmountValue;
}

/**
 * Converts a persisted payment amount to a Decimal when it is finite.
 *
 * @param value Raw amount from a finance payment column.
 * @returns Decimal amount, or `undefined` when the value is missing or invalid.
 * @throws This helper does not throw for missing or non-finite values.
 */
function toDecimalAmount(
  value: PaymentAmountValue,
): Prisma.Decimal | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? new Prisma.Decimal(amount) : undefined;
}

/**
 * Resolves the member-payment amount that should be used for challenge budget sync.
 *
 * Challenge payment `total_amount` values can include the billing challenge fee
 * for older or external callers, while `gross_amount` is the member-payment
 * amount before markup. Billing-account lock/consume rows must be based on
 * that member amount so the markup is not applied a second time. Rows without a
 * valid gross amount fall back to `total_amount` for backward compatibility.
 *
 * @param payment payment amount fields from a finance payment row.
 * @returns Decimal member-payment amount for billing-account synchronization.
 * @throws This helper does not throw for invalid payment amounts.
 */
export function resolveChallengeMemberPaymentAmount(
  payment: ChallengePaymentBudgetAmount,
): Prisma.Decimal {
  return (
    toDecimalAmount(payment.grossAmount) ??
    toDecimalAmount(payment.totalAmount) ??
    new Prisma.Decimal(0)
  );
}
