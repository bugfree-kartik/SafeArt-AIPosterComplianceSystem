# SafeArt Project Summary

## What is SafeArt?

Safeart is a serverless system for automatically discovering, analyzing, and monitoring poster compliance across streaming platforms (Netflix, Prime Video, Disney+, etc.).

## Architecture Highlights

- **Serverless**: AWS Lambda, DynamoDB, S3, SQS
- **Scalable**: Auto-scaling based on queue depth
- **Cache-Aware**: Deduplication via SHA-256 hashing
- **Idempotent**: Request ID-based deduplication
- **Observable**: Structured logging and metrics (Phase 6)

## Key Components

### 1. Shared Module (`packages/shared`)
- Data models (Job, ComplianceResult, etc.)
- Utilities (hashing, validation)
- Type definitions

### 2. Backend Service (`packages/backend`)
- **Job Creator Lambda**: Downloads posters, uploads to S3, creates jobs
- **Worker Lambda**: Processes jobs, runs compliance checks
- **API Lambda**: Optional internal API for debugging

### 3. Crawler Service (`packages/crawler`)
- Nova Act integration (Phase 3)
- Platform-specific extractors
- Scheduled execution

### 4. Infrastructure (`infrastructure`)
- AWS CDK stack
- All AWS resources defined as code
- Environment-based configuration

## Data Flow

1. **Crawler** discovers posters → calls Job Creator
2. **Job Creator** downloads image → checks cache → uploads to S3 → creates DynamoDB record → sends to SQS
3. **SQS** triggers Worker Lambda
4. **Worker** downloads from S3 → runs compliance check → updates DynamoDB
5. **Results** queryable via DynamoDB or API

## Current Status

✅ **Phase 0 Complete**: Project structure, architecture, and infrastructure code

**Next**: Phase 1 - End-to-end testing of core pipeline

## Key Files

- `README.md` - Project overview
- `docs/architecture.md` - Detailed architecture
- `docs/data-flow.md` - Data flow diagrams
- `docs/deployment.md` - Deployment guide
- `docs/phase-roadmap.md` - Implementation phases
- `docs/quick-start.md` - Quick start guide

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Infrastructure**: AWS CDK
- **Storage**: DynamoDB, S3
- **Messaging**: SQS
- **Compute**: AWS Lambda
- **Crawling**: Nova Act (Phase 3)
- **Scheduling**: EventBridge

## Getting Help

1. Check `docs/quick-start.md` for setup
2. Review `docs/architecture.md` for system design
3. See `docs/phase-roadmap.md` for implementation status
4. Check `docs/deployment.md` for deployment issues

## Contributing

This is a phased project. Follow the phase roadmap and complete each phase before moving to the next.

