# Safeart Architecture

## Overview

Safeart is a serverless system for automatically discovering, analyzing, and monitoring poster compliance across streaming platforms. The system uses AWS services for scalability and reliability.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Streaming Platforms                       │
│  (Netflix, Prime Video, Disney+, Hulu, HBO Max, Apple TV)   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Discover posters
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Crawler Service                           │
│  - Nova Act browser automation                              │
│  - Extracts poster URLs and metadata                        │
│  - Scheduled via EventBridge                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Creates jobs
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Job Creation Service (Lambda)                    │
│  - Downloads poster images                                   │
│  - Uploads to S3                                             │
│  - Creates DynamoDB records                                  │
│  - Pushes to SQS                                             │
│  - Cache-aware & idempotent                                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Job messages
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQS Queue                                 │
│  - Job processing queue                                      │
│  - Dead Letter Queue (DLQ) for failures                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Triggers
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker Lambda                                   │
│  - Reads job from SQS                                        │
│  - Fetches image from S3                                     │
│  - Runs compliance checks (Phase 5)                         │
│  - Updates DynamoDB with results                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Stores results
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              DynamoDB (Jobs Table)                           │
│  - Job records with status and results                       │
│  - GSI for cache lookups                                     │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Discovery Phase
- **Crawler** runs on schedule (EventBridge)
- Uses Nova Act to browse platform catalogs
- Extracts poster URLs and metadata
- Calls Job Creation Service for each poster

### 2. Job Creation Phase
- **Job Creator** receives poster information
- Downloads poster image from source URL
- Computes SHA-256 hash for cache lookup
- Checks DynamoDB for existing results (cache hit)
- If new: uploads to S3, creates DynamoDB record, sends to SQS
- If cached: returns cached result immediately

### 3. Processing Phase
- **SQS** triggers Worker Lambda
- **Worker** reads job message
- Downloads image from S3
- Runs compliance checks (vision models)
- Updates DynamoDB with results
- On failure: message goes to DLQ

### 4. Query Phase
- Internal API or direct DynamoDB queries
- Retrieve job status and compliance results
- Filter by platform, status, date range

## Core Components

### Storage

#### DynamoDB Table: `safeart-jobs`
- **Primary Key**: `jobId` (string)
- **GSI 1**: `PosterHashIndex` on `posterHash` (for cache lookups)
- **GSI 2**: `StatusIndex` on `status` + `createdAt` (for status queries)
- **Attributes**:
  - Job metadata (source, platform, timestamps)
  - Status (PENDING, PROCESSING, COMPLETED, FAILED, CACHED)
  - Compliance results
  - S3 references

#### S3 Bucket: `safeart-posters`
- **Structure**: `posters/{platform}/{hash-prefix}/{hash}.jpg`
- **Lifecycle**: 1 year retention
- **Encryption**: S3-managed encryption
- **Access**: Private (Lambda-only)

### Messaging

#### SQS Queue: `safeart-jobs`
- **Type**: Standard queue
- **Visibility Timeout**: 5 minutes
- **Long Polling**: 20 seconds
- **DLQ**: After 3 failed attempts

### Compute

#### Lambda Functions

1. **Job Creator Lambda**
   - Handles job creation requests
   - Downloads and uploads images
   - Manages cache lookups
   - Memory: 512 MB
   - Timeout: 2 minutes

2. **Worker Lambda**
   - Processes jobs from SQS
   - Runs compliance checks
   - Updates job status
   - Memory: 1024 MB
   - Timeout: 3 minutes
   - Concurrency: 10 reserved

3. **Crawler Lambda** (Phase 3)
   - Runs Nova Act crawler
   - Scheduled via EventBridge
   - Triggers job creation

### API Gateway (Optional)

- **Endpoint**: `/jobs` (POST)
- **Purpose**: Internal debugging/inspection
- **Authentication**: TBD (add in Phase 6)

## Job Schema

See `packages/shared/src/models/job.ts` for complete schema.

Key fields:
- `jobId`: Unique identifier
- `posterHash`: SHA-256 hash for deduplication
- `status`: Current processing status
- `source`: Platform and URL information
- `metadata`: Title and poster metadata
- `result`: Compliance check results
- `cache`: Cache hit information

## Caching Strategy

1. **Poster Hash**: SHA-256 of image content
2. **Lookup**: Query DynamoDB GSI by `posterHash`
3. **Cache Hit**: Return existing result if status is COMPLETED
4. **Cache Miss**: Create new job and process

## Idempotency

- **Request ID**: Optional `requestId` in job creation
- **Deduplication**: Check for existing job with same `requestId`
- **Poster Hash**: Same poster = same `jobId` (deterministic)

## Error Handling

1. **Job Creation Failures**: Return error to caller
2. **Processing Failures**: Retry up to 3 times, then DLQ
3. **DLQ Monitoring**: Alert on DLQ depth (Phase 6)

## Scalability

- **DynamoDB**: On-demand billing, auto-scaling
- **SQS**: Handles high throughput automatically
- **Lambda**: Auto-scales based on queue depth
- **Concurrency Limits**: Reserved concurrency prevents overloading

## Security

- **S3**: Private bucket, Lambda-only access
- **DynamoDB**: IAM roles for Lambda access
- **API Gateway**: TBD - add authentication in Phase 6
- **Secrets**: Use AWS Secrets Manager for API keys (Phase 5)

## Monitoring & Observability (Phase 6)

- **CloudWatch Logs**: Structured logging with correlation IDs
- **CloudWatch Metrics**: Job counts, latency, queue depth
- **CloudWatch Alarms**: DLQ depth, error rates, latency
- **X-Ray**: Distributed tracing (optional)

## Deployment

- **Infrastructure**: AWS CDK (TypeScript)
- **Environments**: dev, prod (via context)
- **CI/CD**: TBD - add in Phase 6

## Performance Targets

- **Job Creation**: < 5 seconds (including download)
- **Job Processing**: < 30 seconds (including model inference)
- **Cache Lookup**: < 100ms
- **Throughput**: 100+ jobs/minute

## Limitations

- **Lambda Timeout**: 15 minutes max (Worker: 3 minutes)
- **SQS Message Size**: 256 KB max
- **DynamoDB Item Size**: 400 KB max
- **S3 Object Size**: 5 TB max (posters are small)

## Future Enhancements

- Step Functions for complex workflows
- Batch processing for large backlogs
- Multi-region deployment
- Real-time streaming results
- Advanced analytics dashboard

