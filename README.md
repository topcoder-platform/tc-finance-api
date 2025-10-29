# Topcoder Finance API

A comprehensive payment management system for Topcoder platform, handling winnings, withdrawals, and payment processing through integration with Trolley payment provider.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Development](#development)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Additional Documentation](#additional-documentation)

## Overview

The Topcoder Finance API is a microservice built with NestJS that manages all financial operations for the Topcoder platform, including:

- **Winnings Management**: Create, track, and manage member winnings from challenges and contests
- **Payment Processing**: Integration with Trolley for payment disbursements
- **Withdrawal System**: Allow members to withdraw their earnings
- **Payment Methods**: Support for multiple payment methods (Trolley, PayPal, Payoneer)
- **Tax Management**: Handle tax forms and compliance
- **Admin Operations**: Administrative tools for managing payments and auditing transactions
- **Webhook Handling**: Process real-time events from Trolley payment provider

## Technology Stack

### Core Framework & Language

- **Node.js** v22.13.1+
- **TypeScript** v5.9.3
- **NestJS** v11.1.7 - Modern Node.js framework for building scalable server-side applications

### Database & ORM

- **PostgreSQL** v16 - Relational database for transaction data
- **Prisma** v6.18.0 - Type-safe ORM for database operations and migrations

### Payment Integration

- **Trolley (trolleyhq)** v1.1.0 - Payment provider SDK for international payouts

### Authentication & Security

- **Auth0** - JWT-based authentication for users and M2M services
- **jsonwebtoken** v9.0.2 - JWT token handling
- **jwks-rsa** v3.2.0 - RSA signature verification

### Documentation & Validation

- **Swagger/OpenAPI** (@nestjs/swagger v11.2.1) - API documentation
- **class-validator** v0.14.2 - DTO validation
- **class-transformer** v0.5.1 - Object transformation

### Utilities

- **Winston** v3.18.3 - Logging framework
- **csv/csv-stringify** v6.6.0 - CSV export functionality
- **lodash** v4.17.21 - Utility functions
- **nanoid** v5.1.6 - Unique ID generation

### Development Tools

- **ESLint** v9.38.0 - Code linting
- **Prettier** v3.6.2 - Code formatting
- **Jest** v30.2.0 - Testing framework
- **SWC** v1.13.5 - Fast TypeScript/JavaScript compiler

### Infrastructure

- **Docker** - Containerization
- **CircleCI** - CI/CD pipeline
- **AWS ECS Fargate** - Container orchestration

## Architecture

The application follows a modular architecture with clear separation of concerns:

```
src/
├── api/                      # API layer - Controllers and business logic
│   ├── admin/               # Admin operations (winnings management, auditing)
│   ├── payment-providers/   # Payment provider integrations (Trolley)
│   ├── repository/          # Data access layer
│   ├── user/                # User operations (profile, payment methods)
│   ├── wallet/              # Wallet operations (balance, transactions)
│   ├── webhooks/            # Webhook handlers (Trolley events)
│   ├── winnings/            # Winnings operations (CRUD, search)
│   └── withdrawal/          # Withdrawal operations
├── core/                     # Core functionality
│   ├── auth/                # Authentication & authorization (guards, middleware)
│   └── request/             # Request context management
├── shared/                   # Shared modules and services
│   ├── global/              # Global services (Prisma, Trolley, OTP, Logging)
│   ├── payments/            # Payment processing services
│   └── topcoder/            # Topcoder platform integration (Members, Challenges, Email)
├── config/                   # Configuration management
├── dto/                      # Data Transfer Objects
└── main.ts                   # Application entry point
```

### Key Components

**Controllers**: Handle HTTP requests and responses

- `AdminController` - Payment admin operations
- `WinningsController` - Winnings CRUD operations
- `WithdrawalController` - Withdrawal requests
- `WalletController` - User wallet operations
- `WebhooksController` - Trolley webhook events

**Services**: Business logic implementation

- `TrolleyService` (Global) - Core Trolley SDK integration
- `TrolleyService` (PaymentProviders) - User-facing Trolley operations
- `TrolleyService` (Webhooks) - Webhook event processing
- `WithdrawalService` - Withdrawal processing logic
- `AdminService` - Administrative operations
- `WalletService` - Wallet management

**Repositories**: Data access patterns

- `WinningsRepository` - Winnings data operations
- `PaymentMethodRepository` - Payment method management
- `TaxFormRepository` - Tax form operations
- `OriginRepository` - Origin/source tracking

**Guards & Middleware**:

- `AuthGuard` - JWT authentication validation
- `RolesGuard` - Role-based access control
- `TokenValidatorMiddleware` - Token parsing and validation
- `CreateRequestStoreMiddleware` - Request context storage

For detailed architecture diagrams and data flow, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## Quick Start

### Prerequisites

- Node.js v22.13.1+ (see `.nvmrc`)
- PostgreSQL v16
- pnpm package manager
- Docker (optional, for containerized database)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd tc-finance-api
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.sample .env
# Edit .env with your configuration
```

4. Start the database (Docker):

```bash
docker-compose up -d
```

5. Run database migrations:

```bash
npx prisma migrate dev
```

6. Start the application:

```bash
# Development mode with hot-reload
pnpm run start:dev

# Production mode
pnpm run start:prod
```

The API will be available at `http://localhost:3000/v5/finance`

## Environment Setup

The application requires several environment variables to be configured. See [ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md) for a complete reference.

### Critical Environment Variables

**Database**:

- `DATABASE_URL` - PostgreSQL connection string

**Authentication**:

- `AUTH0_CLIENT_ID` - Auth0 client ID for user authentication
- `AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_SECRET` - Auth0 M2M credentials
- `AUTH0_CERT` - RSA public key for JWT verification

**Trolley Integration**:

- `TROLLEY_ACCESS_KEY`, `TROLLEY_SECRET_KEY` - Trolley API credentials
- `TROLLEY_WH_HMAC` - Webhook signature validation secret
- `TROLLEY_WIDGET_BASE_URL` - Trolley widget URL

**Topcoder Platform**:

- `TOPCODER_API_BASE_URL` - Base URL for Topcoder APIs
- `TOPCODER_WALLET_URL` - Wallet frontend URL for CORS

## Database Setup

The application uses **PostgreSQL** with **Prisma ORM** for database operations.

### Local Setup

1. **Using Docker** (Recommended):

```bash
docker-compose up -d
# PostgreSQL will be available on port 5434
```

2. **Manual Setup**:
   - Install PostgreSQL v16
   - Create database: `walletdb`
   - Update `DATABASE_URL` in `.env`

### Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (development)
npx prisma migrate dev

# Run migrations (production)
npx prisma migrate deploy

# Reset database (destructive)
npx prisma migrate reset --force
```

### Database Schema

The database includes tables for:

- `winnings` - Member winnings/earnings
- `payment` - Individual payment records with installments
- `payment_releases` - Batched payment releases to Trolley
- `payment_method` - Supported payment methods
- `user_payment_methods` - User-linked payment methods
- `trolley_recipient` - Trolley recipient mappings
- `trolley_webhook_log` - Webhook event tracking
- `audit` - Audit trail for winnings changes
- `otp` - One-time passwords for sensitive operations
- Tax and verification-related tables

For detailed schema documentation, see [DATABASE.md](./docs/DATABASE.md)

## Development

### Available Scripts

```bash
# Start development server with hot-reload
pnpm run start:dev

# Start in debug mode
pnpm run start:debug

# Build for production
pnpm run build

# Format code
pnpm run format

# Lint code
pnpm run lint
```

### Code Structure

The codebase follows NestJS best practices:

- **Controllers**: HTTP request handling with decorators
- **Services**: Business logic (injectable)
- **Modules**: Feature grouping and dependency injection
- **DTOs**: Data validation with class-validator
- **Guards**: Route protection and authorization
- **Middleware**: Request preprocessing

### Role-Based Access Control

The API uses role-based access control with the following roles:

- `User` - Regular authenticated users (withdrawals, view own data)
- `PaymentAdmin` - Full administrative access
- `PaymentEditor` - Edit payments and winnings
- `PaymentViewer` - Read-only access to payment data
- `M2M` - Machine-to-machine service access

## Testing

```bash
# Run unit tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run e2e tests
pnpm run test:e2e

# Generate coverage report
pnpm run test:cov
```

## API Documentation

Interactive API documentation is available via Swagger UI when running the application:

**Swagger UI**: `http://localhost:3000/v5/finance/api-docs`

## Deployment

### Docker Build

```bash
# Build Docker image
docker build -t tc-finance-api:latest .

# Build with database reset
docker build --build-arg RESET_DB_ARG=true -t tc-finance-api:latest .
```

### CI/CD Pipeline

The application uses CircleCI for continuous deployment:

- **Dev Environment**: Deploys from `dev` branch
- **Production**: Deploys from `master` branch
- **Target**: AWS ECS Fargate

### Deployment Process

1. Code is pushed to `dev` or `master` branch
2. CircleCI triggers build pipeline
3. Docker image is built with appropriate environment
4. Image is pushed to AWS ECR
5. ECS service is updated with new image
6. Database migrations run automatically on container start

For detailed deployment documentation, see [DEPLOYMENT.md](./docs/DEPLOYMENT.md)

## Additional Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Detailed architecture and data flow diagrams
- [ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md) - Complete environment variable reference
- [DATABASE.md](./docs/DATABASE.md) - Database schema and usage patterns
- [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Build and deployment guide

## Contributing

1. Create a feature branch from `dev`
2. Make your changes following the code style
3. Run tests and linting
4. Submit a pull request to `dev` branch

## Support

For issues and questions, please contact the Topcoder platform team.
