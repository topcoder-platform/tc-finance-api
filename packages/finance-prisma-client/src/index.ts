import { PrismaClient, Prisma } from '../prisma/generated/client';

/**
 * Write operations that should be blocked on the readonly client
 */
const BLOCKED_WRITE_OPERATIONS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const;

/**
 * Creates a read-only Prisma client instance for the finance database.
 * This client only allows read operations (findMany, findFirst, findUnique, count, aggregate, etc.).
 * Write operations (create, update, delete, etc.) will throw an error.
 * 
 * @param connectionString - Database connection string
 * @param options - Optional Prisma client options (logging, transaction timeout, etc.)
 * @returns Configured read-only PrismaClient instance
 */
export function createFinancePrismaClient(
  connectionString: string,
  options?: Omit<Prisma.PrismaClientOptions, 'datasources'>
): PrismaClient {
  const client = new PrismaClient({
    ...options,
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });

  // Use Prisma middleware to block write operations
  // Type assertion needed because $use may not be in the type definition
  (client as any).$use(async (params: any, next: any) => {
    // Check if this is a write operation
    if (BLOCKED_WRITE_OPERATIONS.includes(params.action)) {
      throw new Error(
        `Write operation '${params.model}.${params.action}' is not allowed on read-only finance Prisma client. ` +
        'This client only supports read operations (findMany, findFirst, findUnique, count, aggregate, groupBy, etc.).'
      );
    }

    // Allow read operations and other allowed operations
    return next(params);
  });

  return client;
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
