# Database Documentation

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Indexes](#indexes)
- [Migrations](#migrations)

## Overview

The Topcoder Finance API uses **PostgreSQL v16** as its relational database management system, with **Prisma v6.18.0** as the ORM layer for type-safe database access and schema migrations.

### Key Features

- **ACID Compliance**: Ensures data consistency and reliability
- **Type Safety**: Prisma provides full TypeScript type definitions
- **Migration Management**: Version-controlled schema changes
- **Connection Pooling**: Efficient database connection management
- **Transactional Support**: Complex operations with rollback capabilities

## Technology Stack

### PostgreSQL v16

- **Features Used**:
  - UUID generation (`uuid_generate_v4()`)
  - JSONB columns for flexible attributes
  - Enum types for constrained values
  - Timestamp with timezone support
  - Composite indexes for query optimization

### Prisma ORM v6.18.0

- **Features Used**:
  - Schema-first approach
  - Migration versioning
  - Prisma Client generation
  - Relation management
  - Raw SQL support when needed

## Indexes

### Performance Indexes

**winnings table**:

```sql
CREATE INDEX idx_winnings_winner_id_only ON winnings(winner_id, winning_id);
CREATE INDEX idx_winnings_winner_created_at ON winnings(winner_id, created_at DESC);
CREATE INDEX idx_winnings_category_created_at ON winnings(category, created_at DESC);
CREATE INDEX idx_winnings_created_at ON winnings(created_at DESC);
```

**payment table**:

```sql
CREATE INDEX idx_payment_winnings_id ON payment(winnings_id);
CREATE INDEX idx_payment_status_winnings ON payment(payment_status, winnings_id);
CREATE INDEX idx_payment_installment_number ON payment(installment_number);
CREATE INDEX idx_payment_win_inst_status ON payment(winnings_id, installment_number, payment_status);
CREATE INDEX idx_payment_installment_status_version ON payment(
  installment_number,
  payment_status,
  winnings_id,
  version DESC
);
CREATE INDEX idx_payment_winnings_installment ON payment(winnings_id, installment_number);
```

### Unique Indexes

- `payment_method.payment_method_type` - Ensures unique method types
- `trolley_webhook_log.event_id` - Prevents duplicate processing
- `trolley_recipient.user_id` - One recipient per user
- `trolley_recipient.trolley_id` - Unique Trolley ID
- `user_payment_methods (user_id, payment_method_id)` - One method per user

## Migrations

### Migration Management

Prisma manages database schema through migration files located in `prisma/migrations/`.

**Key Commands**:

```bash
# Create a new migration (development)
npx prisma migrate dev --name <migration_name>

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (destructive!)
npx prisma migrate reset --force

# View migration status
npx prisma migrate status

# Generate Prisma Client
npx prisma generate
```

### Migration Workflow

1. **Development**:

   ```bash
   # Modify prisma/schema.prisma
   # Generate migration
   npx prisma migrate dev --name add_new_column

   # Migration file created in prisma/migrations/
   # Database updated
   # Prisma Client regenerated
   ```

2. **Production Deployment**:

   ```bash
   # In CI/CD or startup script
   npx prisma migrate deploy

   # Applies pending migrations
   # Fails if database is out of sync
   ```

3. **Rollback** (Manual):
   - Prisma doesn't support automatic rollback
   - Must manually revert by applying inverse operations
   - Or restore from backup

### Migration Best Practices

1. **Always create migrations in development first**
2. **Test migrations on staging environment**
3. **Keep migrations small and focused**
4. **Never edit migration files after creation**
5. **Include both up and down logic in documentation**
6. **Back up production database before applying**
