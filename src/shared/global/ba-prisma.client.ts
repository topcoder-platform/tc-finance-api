import { PrismaClientOptions } from '@prisma/client/runtime/library';
import { PrismaClient as BaPrismaClient } from '@topcoder/billing-accounts-api-v6/packages/ba-prisma-client';
import { ENV_CONFIG } from 'src/config';

const clientOptions = {
  transactionOptions: {
    timeout: 20000,
  },
  log: [
    { level: 'query', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ] as PrismaClientOptions['log'],
};

let baPrismaClient: BaPrismaClient;
export const getBaClient = () => {
  if (!baPrismaClient) {
    if (!ENV_CONFIG.BILLING_ACCOUNTS_DB_URL) {
      throw new Error(
        'BILLING_ACCOUNTS_DB_URL must be set for challenges Prisma client',
      );
    }
    baPrismaClient = new BaPrismaClient({
      ...clientOptions,
      datasources: { db: { url: ENV_CONFIG.BILLING_ACCOUNTS_DB_URL } },
    });
  }
  return baPrismaClient;
};
