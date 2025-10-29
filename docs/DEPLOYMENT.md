# Deployment Documentation

## Table of Contents

- [Overview](#overview)
- [Deployment Environments](#deployment-environments)
- [Build Process](#build-process)
- [CI/CD Pipeline](#cicd-pipeline)
- [Configuration Management](#configuration-management)
- [Monitoring and Health Checks](#monitoring-and-health-checks)

## Overview

The Topcoder Finance API uses a containerized deployment approach with Docker and AWS ECS Fargate, orchestrated through CircleCI for continuous integration and deployment.

### Deployment Architecture

```
┌──────────────┐         ┌─────────────────┐         ┌──────────────┐
│   GitHub     │         │    CircleCI     │         │     AWS      │
│  Repository  │────────>│   CI/CD Jobs    │────────>│  ECS Fargate │
│              │         │                 │         │              │
│ ├─ dev       │         │ ├─ Build        │         │ ├─ Dev Env   │
│ └─ master    │         │ ├─ Test         │         │ └─ Prod Env  │
│              │         │ ├─ Push ECR     │         │              │
└──────────────┘         │ └─ Deploy       │         └──────────────┘
                         └─────────────────┘
                                  │
                                  │
                         ┌────────┴──────────┐
                         │                   │
                    ┌────▼─────┐      ┌─────▼────┐
                    │   ECR    │      │   ECS    │
                    │ Registry │      │ Service  │
                    └──────────┘      └──────────┘
```

### Technology Stack

- **Source Control**: GitHub
- **CI/CD**: CircleCI v2.1
- **Container Registry**: AWS ECR (Elastic Container Registry)
- **Container Orchestration**: AWS ECS Fargate
- **Infrastructure**: AWS (VPC, ALB, RDS)
- **Configuration**: AWS Parameter Store / Secrets Manager

## Deployment Environments

### Development Environment

**Branch**: `dev`

**Infrastructure**:

- Environment Name: `DEV`
- AWS Region: us-east-1 (typically)
- ECS Cluster: topcoder-dev-cluster
- Database: RDS PostgreSQL (Dev instance)

**Configuration**:

- `DEPLOYMENT_ENVIRONMENT=dev`
- `LOGICAL_ENV=dev`
- Auto-deploys on push to `dev` branch
- Database migrations run automatically
- Can reset database with pipeline parameter

**Access**:

- API: `https://api.topcoder-dev.com/v6/finance`
- Swagger: `https://api.topcoder-dev.com/v6/finance/api-docs`

### Production Environment

**Branch**: `master`

**Infrastructure**:

- Environment Name: `PROD`
- AWS Region: us-east-1 (typically)
- ECS Cluster: topcoder-prod-cluster
- Database: RDS PostgreSQL (Production instance with Multi-AZ)

**Configuration**:

- `DEPLOYMENT_ENVIRONMENT=prod`
- `LOGICAL_ENV=prod`
- Auto-deploys on push to `master` branch
- Database migrations run automatically (no reset)
- Blue-green deployment strategy

**Access**:

- API: `https://api.topcoder.com/v6/finance`
- Swagger: `https://api.topcoder.com/v6/finance/api-docs` (may be disabled)

## Build Process

### Local Build

#### Development Build

```bash
# Install dependencies
pnpm install

# Generate Prisma client
npx prisma generate

# Build TypeScript
pnpm run build

# Output: dist/ directory
```

#### Docker Build

```bash
# Build with default settings
docker build -t tc-finance-api:latest .

# Build with database reset (for dev/testing)
docker build \
  --build-arg RESET_DB_ARG=true \
  --build-arg SEED_DATA_ARG=dev \
  -t tc-finance-api:dev .

# Run locally
docker run -p 3000:3000 \
  --env-file .env \
  tc-finance-api:latest
```

### CI/CD Pipeline

### CircleCI Configuration

Location: `.circleci/config.yml`

#### Pipeline Parameters

```yaml
parameters:
  reset-db:
    type: boolean
    default: false
    description: 'Reset database on deployment (dev only)'
```

#### Jobs Overview

```
┌──────────────┐
│ Git Push     │
│ (dev/master) │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│  CircleCI Triggers   │
└──────┬───────────────┘
       │
       ├─────────────────────────────────┐
       │                                 │
       ▼                                 ▼
┌──────────────┐              ┌──────────────┐
│  build-dev   │              │ build-prod   │
│              │              │              │
│ (dev branch) │              │(master branch)│
└──────┬───────┘              └──────┬───────┘
       │                             │
       ▼                             ▼
┌────────────────────────────────────────────┐
│         Build & Deploy Steps               │
│                                            │
│  1. Checkout code                          │
│  2. Setup remote Docker                    │
│  3. Install dependencies (AWS CLI, etc)    │
│  4. Install deploy scripts                 │
│  5. Build Docker image                     │
│  6. Push to ECR                            │
│  7. Deploy to ECS Fargate                  │
└────────────────────────────────────────────┘
```

#### Job Definition: build-prod

Same structure as `build-dev` but with:

- `DEPLOY_ENV: 'PROD'`
- `LOGICAL_ENV: 'prod'`
- `DEPLOYMENT_ENVIRONMENT: 'prod'`
- Triggers on `master` branch only

### Secrets Management

**Sensitive values** stored as SecureString:

- Database credentials
- API keys (Trolley, Auth0)
- Certificates
- HMAC secrets

**Access Control**:

- IAM roles for ECS tasks
- Least privilege principle
- Audit logging enabled

### Updating Configuration

```bash
# Update parameter
aws ssm put-parameter \
  --name "/config/tc-finance-api/appvar/PROD/TROLLEY_SECRET_KEY" \
  --value "new-secret-value" \
  --type "SecureString" \
  --overwrite

# Restart ECS service to pick up changes
aws ecs update-service \
  --cluster topcoder-prod-cluster \
  --service tc-finance-api \
  --force-new-deployment
```

## Monitoring and Health Checks

### Health Check Endpoint

**Endpoint**: `GET /v5/finance/health`

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-27T12:00:00.000Z"
}
```

### Application Logs

**CloudWatch Logs**:

- Log Group: `/ecs/tc-finance-api`
- Log Stream: `ecs/tc-finance-api/{task-id}`
- Retention: 30 days (configurable)

**Log Levels**:

- `error` - Errors requiring attention
- `warn` - Warnings and potential issues
- `info` - General information
- `debug` - Detailed debugging (dev only)
