# Architecture Documentation

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Sequence Diagrams](#sequence-diagrams)
- [Technology Stack](#technology-stack)
- [Integration Points](#integration-points)

## High-Level Architecture

The Topcoder Finance API follows a **layered architecture** pattern with clear separation of concerns:

```mermaid
graph TB
    subgraph External["External Systems"]
        Trolley["Trolley<br/>(Payments)"]
        Auth0["Auth0<br/>(JWT Auth)"]
        TC["Topcoder Platform<br/>(Members/Challenges)"]
    end

    subgraph Controllers["API Layer - Controllers"]
        AdminCtrl["Admin<br/>Controller"]
        WinningsCtrl["Winnings<br/>Controller"]
        WalletCtrl["Wallet<br/>Controller"]
        WebhooksCtrl["Webhooks<br/>Controller"]
        WithdrawalCtrl["Withdrawal<br/>Controller"]
        UserCtrl["User<br/>Controller"]
        PaymentProvCtrl["Payment Providers<br/>Controller"]
    end

    subgraph Services["Business Logic Layer - Services"]
        AdminSvc["Admin<br/>Service"]
        WinningsSvc["Winnings<br/>Service"]
        WalletSvc["Wallet<br/>Service"]
        WithdrawalSvc["Withdrawal<br/>Service"]
        TrolleySvc["Trolley<br/>Service"]
        PaymentsSvc["Payments<br/>Service"]
    end

    subgraph Repositories["Data Access Layer - Repositories"]
        WinningsRepo["Winnings<br/>Repository"]
        PaymentMethodRepo["Payment Method<br/>Repository"]
        TaxFormRepo["Tax Form<br/>Repository"]
    end

    subgraph DataLayer["Data Layer"]
        Prisma["Prisma ORM<br/>(Type-Safe)"]
        DB[("PostgreSQL Database<br/>winnings, payment,<br/>audit, otp, tax_form,<br/>trolley_*, user_payment")]
    end

    Trolley -->|Webhooks| WebhooksCtrl
    Auth0 -->|JWT| AdminCtrl
    Auth0 -->|JWT| WinningsCtrl
    Auth0 -->|JWT| WalletCtrl
    Auth0 -->|JWT| WithdrawalCtrl
    Auth0 -->|JWT| UserCtrl
    Auth0 -->|JWT| PaymentProvCtrl
    TC -->|API Calls| AdminSvc
    TC -->|API Calls| WinningsSvc

    AdminCtrl --> AdminSvc
    WinningsCtrl --> WinningsSvc
    WalletCtrl --> WalletSvc
    WithdrawalCtrl --> WithdrawalSvc
    UserCtrl --> TrolleySvc
    PaymentProvCtrl --> TrolleySvc
    WebhooksCtrl --> TrolleySvc

    AdminSvc --> WinningsRepo
    WinningsSvc --> WinningsRepo
    WalletSvc --> WinningsRepo
    WithdrawalSvc --> TrolleySvc
    WithdrawalSvc --> PaymentsSvc
    TrolleySvc --> Trolley
    PaymentsSvc --> PaymentMethodRepo

    WinningsRepo --> Prisma
    PaymentMethodRepo --> Prisma
    TaxFormRepo --> Prisma

    Prisma --> DB

    style External fill:#e1f5ff
    style Controllers fill:#fff4e6
    style Services fill:#f3e5f5
    style Repositories fill:#e8f5e9
    style DataLayer fill:#fce4ec
```

## System Components

### 1. API Layer (Controllers)

Controllers handle HTTP requests and route them to appropriate services:

**AdminController** (`/v5/finance/admin`)

- Payment administration operations
- Winnings search and export
- Audit log retrieval
- Requires: `PaymentAdmin`, `PaymentEditor`, or `PaymentViewer` roles

**WinningsController** (`/v5/finance/winnings`)

- User winnings CRUD operations
- View personal winnings history
- Requires: `User` role

**WithdrawalController** (`/v5/finance/withdraw`)

- Initiate withdrawal requests
- Validate OTP codes
- Process payment releases
- Requires: `User` role

**WalletController** (`/v5/finance/wallet`)

- Get wallet balance
- View transaction history
- Requires: `User` role

**PaymentProvidersController** (`/v5/finance/payment-providers`)

- Trolley portal URL generation
- Payment method management
- Requires: `User` role

**WebhooksController** (`/v5/finance/webhooks`)

- Receive Trolley webhook events
- Public endpoint with signature verification
- No authentication required (validated via HMAC)

### 2. Business Logic Layer (Services)

**AdminService**

- Update winnings details
- Retrieve audit logs
- Manage payment statuses

**WinningsService**

- Create and manage winnings
- Query winnings data
- Apply business rules

**WithdrawalService**

- Process withdrawal requests
- Create Trolley payment batches
- Handle payment releases
- Calculate fees and taxes

**WalletService**

- Calculate available balance
- Aggregate payment data
- Track pending withdrawals

**TrolleyService (Global)**

- Core Trolley SDK wrapper
- API client management
- Payment batch operations
- Recipient management

**TrolleyService (PaymentProviders)**

- User-facing Trolley operations
- Recipient creation and linking
- Portal URL generation

**TrolleyService (Webhooks)**

- Webhook signature validation
- Event processing and routing
- Database logging

**PaymentsService**

- Payment processing logic
- Fee calculations
- Payment method validation

### 3. Data Access Layer (Repositories)

**WinningsRepository**

- Complex winnings queries with filters
- Pagination and sorting
- Join operations with payments

**PaymentMethodRepository**

- Payment method CRUD
- User payment method associations

**TaxFormRepository**

- Tax form management
- Status tracking

**OriginRepository**

- Origin/source tracking
- Reference data

### 4. Core Modules

**Authentication & Authorization**

- `AuthGuard` - JWT token validation
- `RolesGuard` - Role-based access control
- `TokenValidatorMiddleware` - Token parsing and extraction
- Supports both user JWT and M2M tokens

**Request Context**

- `CreateRequestStoreMiddleware` - Async local storage for request context
- Provides user info across the request lifecycle

**Shared Services**

- `PrismaService` - Database client
- `OtpService` - One-time password generation and validation
- `TopcoderMembersService` - Member API integration
- `TopcoderChallengesService` - Challenge API integration
- `TopcoderEmailService` - Email notifications
- `Logger` - Winston-based logging

## Data Flow

### 1. Withdrawal Request Flow

```mermaid
sequenceDiagram
    participant User as User<br/>(Web UI)
    participant WC as Withdrawal<br/>Controller
    participant WS as Withdrawal<br/>Service
    participant OTP as OTP<br/>Service
    participant Repo as Winnings<br/>Repository
    participant TS as Trolley<br/>Service
    participant Trolley as Trolley<br/>(External)
    participant DB as PostgreSQL

    User->>WC: 1. POST /withdraw<br/>{winningsIds, memo, otpCode}
    activate WC
    WC->>WS: withdraw()
    activate WS

    WS->>OTP: 2. verifyOtp()
    activate OTP
    OTP->>DB: Validate OTP
    DB-->>OTP: OTP verified
    OTP-->>WS: Valid
    deactivate OTP

    WS->>Repo: 3. getReleasableWinnings()
    activate Repo
    Repo->>DB: Query winnings
    DB-->>Repo: Winnings data
    Repo-->>WS: Releasable winnings
    deactivate Repo

    WS->>TS: 4. getPayeeRecipient()
    activate TS
    TS->>Trolley: 5. Search/Create recipient
    Trolley-->>TS: Recipient ID
    TS->>DB: Save recipient mapping
    TS-->>WS: Recipient details
    deactivate TS

    Note over WS: 6. Calculate net amount<br/>(Apply fees & taxes)

    WS->>TS: 7. startBatchPayment()
    activate TS
    TS->>Trolley: Create batch
    Trolley-->>TS: Batch ID
    TS-->>WS: Batch ID
    deactivate TS

    loop For each winning
        WS->>TS: 8. createPayment()
        activate TS
        TS->>Trolley: Add payment to batch
        Trolley-->>TS: Payment ID
        TS-->>WS: Payment ID
        deactivate TS
    end

    WS->>DB: 9. Save payment_releases<br/>Status: Pending
    DB-->>WS: Saved

    WS->>TS: 10. startProcessingPayment()
    activate TS
    TS->>Trolley: Generate quote & process
    Note over Trolley: 11. Process payment<br/>(Async)
    Trolley-->>TS: Processing
    TS-->>WS: Success
    deactivate TS

    WS->>DB: 12. Update payment status<br/>Status: PROCESSING
    DB-->>WS: Updated

    WS-->>WC: Withdrawal successful
    deactivate WS
    WC-->>User: 200 OK
    deactivate WC
```

### 2. Webhook Event Processing Flow

```mermaid
sequenceDiagram
    participant Trolley as Trolley<br/>(External)
    participant WHC as Webhooks<br/>Controller
    participant TS as Trolley<br/>Service<br/>(Webhooks)
    participant DB as PostgreSQL
    participant Handler as Event<br/>Handler
    participant Email as Email<br/>Service

    Trolley->>WHC: 1. POST /webhooks/trolley<br/>Headers: signature, eventId<br/>Body: {model, action, body}
    activate WHC

    WHC->>TS: 2. validateSignature()
    activate TS
    TS-->>WHC: Valid HMAC signature

    WHC->>TS: 3. validateUnique()
    TS->>DB: Check trolley_webhook_log
    DB-->>TS: Event not processed
    TS-->>WHC: Unique event

    WHC->>TS: handleEvent()

    TS->>DB: 4. Insert webhook log<br/>Status: logged
    DB-->>TS: Logged

    Note over TS: 5. Route to handler<br/>based on model.action

    TS->>Handler: Invoke handler
    activate Handler

    alt payment.updated
        Handler->>DB: 6a. Update payment status
        Handler->>DB: Update payment_releases
        Handler->>Email: Send notification
    else recipient.updated
        Handler->>DB: 6b. Update trolley_recipient
    else taxForm.updated
        Handler->>DB: 6c. Update tax form status
    end

    Handler-->>TS: Processing complete
    deactivate Handler

    TS->>DB: 7. Update webhook log<br/>Status: processed
    DB-->>TS: Updated

    TS-->>WHC: Success
    deactivate TS
    WHC-->>Trolley: 200 OK
    deactivate WHC
```

### 3. Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant Middleware as Token Validator<br/>Middleware
    participant AuthGuard as Auth<br/>Guard
    participant RolesGuard as Roles<br/>Guard
    participant Auth0
    participant API as Finance API<br/>Endpoint

    Client->>Middleware: 1. Request with<br/>Authorization: Bearer <JWT>
    activate Middleware

    Middleware->>Middleware: 2. Extract token<br/>from header

    Middleware->>Auth0: 3. Verify signature<br/>with Auth0 Cert (jwks-rsa)
    Auth0-->>Middleware: Signature valid

    Middleware->>Middleware: 4. Check token type<br/>(M2M or User)
    Note over Middleware: Extract claims:<br/>email, userId, scope, etc.

    Middleware-->>AuthGuard: Token parsed & verified
    deactivate Middleware

    activate AuthGuard
    AuthGuard->>AuthGuard: 5. Check authentication:<br/>- Token verified?<br/>- Public route?<br/>- M2M scopes valid?

    alt Authentication Failed
        AuthGuard-->>Client: 401 Unauthorized
    else Authentication Passed
        AuthGuard-->>RolesGuard: Authenticated
    end
    deactivate AuthGuard

    activate RolesGuard
    RolesGuard->>RolesGuard: 6. Check authorization:<br/>- User roles<br/>- Route required roles<br/>- Permissions match?

    alt Authorization Failed
        RolesGuard-->>Client: 403 Forbidden
    else Authorization Passed
        RolesGuard->>API: Process request
        activate API
        API-->>Client: 200 OK + Response
        deactivate API
    end
    deactivate RolesGuard
```

## Sequence Diagrams

### Admin Winnings Search

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant API as AdminController
    participant Repo as WinningsRepository
    participant DB as PostgreSQL
    participant TC as TopcoderMembersService

    Admin->>API: POST /admin/winnings/search
    Note over Admin,API: {filters, pagination}

    API->>Repo: searchWinnings(filters)
    Repo->>DB: Query winnings with joins
    DB-->>Repo: Winnings + Payment data
    Repo-->>API: SearchWinningResult

    API->>TC: getHandlesByUserIds(winnerIds)
    TC-->>API: Map of userId -> handle

    API-->>Admin: Winnings with user handles
```

### User Withdrawal Request

```mermaid
sequenceDiagram
    participant User
    participant WC as WithdrawalController
    participant WS as WithdrawalService
    participant OTP as OtpService
    participant TS as TrolleyService (Global)
    participant Trolley as Trolley API
    participant DB as PostgreSQL

    User->>WC: POST /withdraw {winningsIds, memo, otpCode}
    WC->>WS: withdraw(userId, winningsIds, memo, otpCode)

    WS->>OTP: verifyOtp(email, otpCode)
    OTP->>DB: Query otp table
    DB-->>OTP: OTP record
    OTP-->>WS: Valid/Invalid

    alt OTP Invalid
        WS-->>User: Error: Invalid OTP
    end

    WS->>DB: Query releasable winnings
    DB-->>WS: Winnings list

    WS->>TS: getPayeeRecipient(user)
    TS->>Trolley: Search/Create recipient
    Trolley-->>TS: Recipient ID
    TS->>DB: Save trolley_recipient
    DB-->>TS: Success
    TS-->>WS: Recipient details

    WS->>TS: startBatchPayment(description)
    TS->>Trolley: Create batch
    Trolley-->>TS: Batch ID
    TS-->>WS: Batch ID

    loop For each winning
        WS->>TS: createPayment(recipientId, batchId, amount)
        TS->>Trolley: Create payment
        Trolley-->>TS: Payment ID
        TS-->>WS: Payment ID
    end

    WS->>DB: Create payment_releases
    DB-->>WS: Success

    WS->>TS: startProcessingPayment(batchId)
    TS->>Trolley: Generate quote & process
    Trolley-->>TS: Processing
    TS-->>WS: Success

    WS->>DB: Update payment status
    DB-->>WS: Success

    WS-->>WC: Withdrawal successful
    WC-->>User: 200 OK
```

### Trolley Webhook Processing

```mermaid
sequenceDiagram
    participant Trolley
    participant WHC as WebhooksController
    participant TS as TrolleyService (Webhooks)
    participant Handler as Event Handler
    participant DB as PostgreSQL
    participant Email as EmailService

    Trolley->>WHC: POST /webhooks/trolley
    Note over Trolley,WHC: Headers: signature, eventId<br/>Body: {model, action, body}

    WHC->>TS: validateSignature(headers, body)
    TS-->>WHC: Valid

    WHC->>TS: validateUnique(headers)
    TS->>DB: Check trolley_webhook_log
    DB-->>TS: Event not processed
    TS-->>WHC: Unique

    WHC->>TS: handleEvent(headers, payload)

    TS->>DB: Insert webhook log (status: logged)
    DB-->>TS: Success

    TS->>Handler: Invoke handler for model.action

    alt payment.updated
        Handler->>DB: Update payment status
        Handler->>DB: Update payment_releases
        Handler->>Email: Send notification
    else recipient.updated
        Handler->>DB: Update trolley_recipient
    else taxForm.updated
        Handler->>DB: Update tax form status
    end

    Handler-->>TS: Processing complete

    TS->>DB: Update webhook log (status: processed)
    DB-->>TS: Success

    TS-->>WHC: Success
    WHC-->>Trolley: 200 OK
```

## Technology Stack

### Backend Framework

- **NestJS v11.1.7** - Modular, scalable Node.js framework
  - Dependency Injection
  - Decorators for routing, validation, guards
  - Module-based architecture

### Language

- **TypeScript v5.9.3** - Type-safe JavaScript
  - Strong typing for DTOs and entities
  - Compile-time error checking
  - Enhanced IDE support

### Database Layer

- **PostgreSQL v16** - Relational database
  - ACID compliance
  - Complex queries with joins
  - Transactional support
- **Prisma v6.18.0** - Modern ORM
  - Type-safe database client
  - Schema migrations
  - Query builder
  - Database introspection

### Authentication

- **Auth0** - Identity platform
  - JWT token-based authentication
  - M2M (Machine-to-Machine) support
  - RSA signature verification (jwks-rsa)
- **jsonwebtoken v9.0.2** - JWT handling
  - Token parsing and validation
  - Signature verification

### Payment Integration

- **Trolley SDK v1.1.0** - Payment provider
  - Recipient management
  - Batch payments
  - Webhook events
  - International payouts

### API Documentation

- **Swagger/OpenAPI** - Interactive API docs
  - Auto-generated from decorators
  - Try-it-out functionality
  - Schema definitions

### Validation

- **class-validator v0.14.2** - DTO validation
  - Decorator-based validation rules
  - Automatic request validation
- **class-transformer v0.5.1** - Object transformation
  - Plain object to class instance
  - Type coercion

### Logging

- **Winston v3.18.3** - Logging framework
  - Structured logging
  - Multiple transports
  - Log levels

## Integration Points

### 1. Trolley Payment Provider

**Purpose**: Process international payments to members

**Integration Type**: REST API + Webhooks

**Key Operations**:

- Create/manage recipients
- Create payment batches
- Process payments
- Handle webhook events

**Authentication**: API Key + Secret (HMAC for webhooks)

**Endpoints Used**:

- `POST /recipients` - Create recipient
- `GET /recipients/search` - Find recipient
- `POST /batches` - Create payment batch
- `POST /batches/{id}/payments` - Add payment
- `POST /batches/{id}/generate-quote` - Generate quote
- `POST /batches/{id}/start-processing` - Start processing

**Webhook Events**:

- `payment.updated` - Payment status changed
- `recipient.updated` - Recipient info updated
- `taxForm.updated` - Tax form status changed
- `recipientAccount.created/updated` - Payment method added

### 2. Auth0 Identity Platform

**Purpose**: User authentication and authorization

**Integration Type**: JWT token validation

**Key Operations**:

- Validate JWT signatures
- Extract user claims
- Verify M2M tokens
- Check scopes and roles

**Authentication**: RSA Public Key (AUTH0_CERT)

**Token Types**:

- User JWT: Contains email, handle, userId
- M2M JWT: Contains scope and clientId

### 3. Topcoder Platform APIs

**Purpose**: Member and challenge data

**Integration Type**: REST API (M2M)

**Key Operations**:

- Get member profile data
- Fetch user handles
- Update challenge payment status
- Send email notifications

**Authentication**: Auth0 M2M token

**APIs Used**:

- Members API: `/v5/members/{handle}`
- Challenges API: `/v5/challenges/{id}`
- Email Service: Kafka bus messages

### 4. Database (PostgreSQL)

**Purpose**: Persistent data storage

**Integration Type**: Prisma ORM

**Key Tables**:

- `winnings` - Member earnings
- `payment` - Payment records
- `payment_releases` - Batch releases
- `trolley_recipient` - Trolley mappings
- `user_payment_methods` - Payment methods
- `trolley_webhook_log` - Webhook tracking
- `audit` - Audit trail
- `otp` - One-time passwords

**Connection**: Connection pooling via Prisma

## Security Considerations

### Authentication & Authorization

- All endpoints require authentication
- Role-based access control (RBAC)
- JWT signature verification
- M2M token scope validation

### Webhook Security

- HMAC signature validation
- Replay attack prevention (event ID tracking)
- IP allowlisting (optional)

### Data Protection

- Sensitive data encrypted at rest
- HTTPS/TLS for all communications
- OTP for withdrawal operations
- Audit logging for all critical operations

### Input Validation

- DTO validation using class-validator
- SQL injection prevention via Prisma
- XSS protection via input sanitization
- Rate limiting (via infrastructure)

## Scalability & Performance

### Horizontal Scaling

- Stateless API design
- No session storage
- Can run multiple instances

### Database Optimization

- Indexed columns for common queries
- Efficient joins via Prisma
- Connection pooling
- Read replicas (future)

### Caching Strategy

- No application-level caching currently
- Database query caching

### Async Processing

- Webhook processing is async
- Payment batch processing is async
- Email notifications are async (Kafka)

## Error Handling

### Application Errors

- NestJS exception filters
- Structured error responses
- Error logging via Winston

### External Service Failures

- Retry logic for Trolley API
- Graceful degradation
- Error status tracking

### Database Errors

- Transaction rollback on failure
- Prisma error handling
- Connection retry logic

## Monitoring & Observability

### Logging

- Winston structured logging
- Log levels: error, warn, info, debug
- Request/response logging
- Webhook event logging
