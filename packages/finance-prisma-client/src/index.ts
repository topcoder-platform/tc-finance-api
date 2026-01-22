import { PrismaClient, Prisma } from '../prisma/generated/client';

/**
 * Creates a Prisma client instance for the finance database
 * @param connectionString - Database connection string
 * @param options - Optional Prisma client options (logging, transaction timeout, etc.)
 * @returns Configured PrismaClient instance
 */
export function createFinancePrismaClient(
  connectionString: string,
  options?: Omit<Prisma.PrismaClientOptions, 'datasources'>
): PrismaClient {
  return new PrismaClient({
    ...options,
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });
}

// Re-export Prisma types and enums for use in consuming applications
export {
  Prisma,
  PrismaClient,
} from '../prisma/generated/client';

// Export all model types
export type {
  audit,
  origin,
  otp,
  payment,
  payment_method,
  payment_release_associations,
  payment_releases,
  user_payment_methods,
  user_tax_form_associations,
  winnings,
  trolley_recipient,
  trolley_webhook_log,
  user_identity_verification_associations,
  trolley_recipient_payment_method,
  challenge_lock,
} from '../prisma/generated/client';

// Export all enum types
export type {
  webhook_status,
  verification_status,
  action_type,
  payment_method_status,
  payment_status,
  reference_type,
  tax_form_status,
  transaction_status,
  winnings_category,
  winnings_type,
} from '../prisma/generated/client';
