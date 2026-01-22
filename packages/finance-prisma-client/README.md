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

## Building

Before using this package, you need to build it:

```bash
npm run build
```

This will:
1. Generate the Prisma client from the schema
2. Compile TypeScript to JavaScript
