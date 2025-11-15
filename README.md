# SafeArt - AI Poster Compliance System

A serverless system for automatically discovering, analyzing, and monitoring poster compliance across streaming platforms using AI-powered compliance checks.

## Architecture Overview

```
┌─────────────┐
│   Crawler   │  (Nova Act + Browser Automation)
│   Service   │
└──────┬──────┘
       │ Discovers posters
       │ Creates jobs
       ▼
┌─────────────────────────────────┐
│      Job Creation Service       │
│  - Downloads poster images      │
│  - Uploads to S3                │
│  - Creates DynamoDB records     │
│  - Pushes to SQS                │
│  - Cache-aware & idempotent    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│         SQS Queue               │
│    (with DLQ)                   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│    Worker Lambda                │
│  - Reads job from SQS           │
│  - Fetches image from S3        │
│  - Runs compliance checks       │
│  - Updates DynamoDB             │
└─────────────────────────────────┘
```

## Core Components

### 1. Crawler Service
- Uses Nova Act for browser automation
- Discovers posters from streaming platforms
- Extracts structured metadata
- Triggers job creation

### 2. Backend Service
- **Job Creator**: Handles poster ingestion, S3 upload, DynamoDB writes, SQS messaging
- **Worker Lambda**: Processes compliance checks, updates job status
- **Infrastructure**: DynamoDB, S3, SQS, Lambda, EventBridge

### 3. Shared Module
- Data models (Job schema, compliance results)
- Utilities (hashing, validation)
- Type definitions

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **Infrastructure**: AWS CDK (TypeScript)
- **Storage**: DynamoDB (jobs), S3 (poster images)
- **Messaging**: SQS (job queue)
- **Compute**: AWS Lambda
- **Crawling**: Nova Act (browser automation)
- **Scheduling**: EventBridge

## Project Structure

```
Safeart/
├── packages/
│   ├── shared/          # Shared models and utilities
│   ├── backend/         # Lambda functions and infrastructure
│   └── crawler/         # Nova Act crawler service
├── infrastructure/      # AWS CDK infrastructure code
├── docs/                # Architecture and documentation
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- AWS CLI configured (for AWS deployment)
- AWS CDK CLI installed (`npm install -g aws-cdk`) (for AWS deployment)
- Docker (optional, for LocalStack local testing)

### Quick Test Locally

**Fastest way to test without AWS account:**

1. Install LocalStack:
   ```bash
   brew install localstack/tap/localstack-cli
   # OR: pip install localstack
   ```

2. Start LocalStack:
   ```bash
   localstack start
   ```

3. Setup and test:
   ```bash
   npm install
   npm run build
   npm run local:setup
   npm run test:local
   ```

See **[Quick Test Guide](docs/quick-test-guide.md)** for detailed instructions.

### Deploy to AWS

1. Install dependencies:
```bash
npm install
```

2. Bootstrap CDK (first time only):
```bash
cd infrastructure
cdk bootstrap
```

3. Deploy infrastructure:
```bash
cdk deploy --context env=dev
```

4. Test with real AWS:
```bash
npm run build
npm run test:local:job-creator  # Uses real AWS if env vars are set
```

See **[Deployment Guide](docs/deployment.md)** for more details.

## Development Phases

- **Phase 0**: Project & Architecture Setup ✅
- **Phase 1**: Core Pipeline Foundations (In Progress)
- **Phase 2**: Job Creation & Caching Logic ✅
- **Phase 3**: Nova Act Crawler Integration
- **Phase 4**: Scheduling & Continuous Operation
- **Phase 5**: Compliance Model & Policy Engine
- **Phase 6**: Observability, Operations & Demo Polish

## Testing

- **[Quick Test Guide](docs/quick-test-guide.md)** - Fastest way to test locally
- **[Local Testing Guide](docs/local-testing.md)** - Comprehensive local testing options
- **[Test Scripts](packages/backend/src/test/README.md)** - Test script documentation

## Environment Variables

See `.env.example` files in each package for required configuration.

## License

MIT

