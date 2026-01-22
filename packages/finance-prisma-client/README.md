# @topcoder/finance-prisma-client

Prisma client package for TopCoder Finance API database. This package provides a factory function to create a Prisma client instance with a configurable database connection string.

## Installation

```bash
npm install @topcoder/finance-prisma-client
```

Or via git repository:

```bash
npm install git+https://github.com/your-org/tc-finance-api.git#packages/finance-prisma-client
```

## Usage

### Basic Usage

```typescript
import { createFinancePrismaClient } from '@topcoder/finance-prisma-client';

const prisma = createFinancePrismaClient('postgresql://user:password@localhost:5432/finance_db');

// Use the client
const winnings = await prisma.winnings.findMany();
```

### With Options

```typescript
import { createFinancePrismaClient } from '@topcoder/finance-prisma-client';

const prisma = createFinancePrismaClient(
  'postgresql://user:password@localhost:5432/finance_db',
  {
    log: ['query', 'info', 'warn', 'error'],
    transactionOptions: {
      timeout: 20000, // 20 seconds
    },
  }
);
```

### Using Types

```typescript
import { 
  createFinancePrismaClient,
  Prisma,
  payment_status,
  winnings
} from '@topcoder/finance-prisma-client';

const prisma = createFinancePrismaClient(connectionString);

// Use Prisma types
const payment: Prisma.paymentCreateInput = {
  // ...
};

// Use enum types
const status: payment_status = 'PAID';

// Use model types
const winning: winnings = await prisma.winnings.findFirst();
```

## Building

Before using this package, you need to build it:

```bash
npm run build
```

This will:
1. Generate the Prisma client from the schema
2. Compile TypeScript to JavaScript

## Development

When installing this package in development mode (e.g., via `npm install file:../path`), the `postinstall` script will automatically generate the Prisma client.

## Requirements

- Node.js >= 16
- Prisma >= 6.18.0
- PostgreSQL database

## License

UNLICENSED
