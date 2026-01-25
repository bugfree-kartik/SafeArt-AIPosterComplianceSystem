# Phase Roadmap

This document outlines the implementation phases for the Safeart project.

## Phase 0 – Project & Architecture Setup ✅

**Status**: Complete

- [x] Defined overall architecture (S3 + DynamoDB + SQS + Lambda)
- [x] Set up repo structure (backend, crawler, shared modules)
- [x] Decided deployment stack (AWS CDK)
- [x] Created documentation and diagrams

## Phase 1 – Core Pipeline (Backend) Foundations

**Status**: ✅ Complete

### Tasks

- [x] Define job schema for poster compliance task
- [x] Design data stores (DynamoDB table, S3 buckets)
- [x] Provision core AWS resources (DynamoDB, S3, SQS, Lambda)
- [x] Implement worker Lambda skeleton
- [x] Manually trigger flow end-to-end with test data
- [x] Add Lambda handlers for API Gateway (POST/GET /jobs)
- [x] Create comprehensive end-to-end test suite
- [x] Implement error handling and DLQ test scenarios

### Completed

1. ✅ Job Creator with Lambda handlers (`createJobHandler`, `getJobHandler`)
2. ✅ Worker Lambda with error handling and status updates
3. ✅ End-to-end test script (`npm run test:e2e`)
4. ✅ DLQ and error handling tests (`npm run test:dlq`)
5. ✅ CDK stack with API Gateway endpoints
6. ✅ LocalStack setup for local development

## Phase 2 – Job Creation & Caching Logic

**Status**: ✅ Complete

### Tasks

- [x] Decide job creation contract
- [x] Implement job creator component
- [x] Add cache-awareness (hash-based lookup)
- [x] Enforce idempotency at job creation
- [x] Validate repeated requests behave consistently

### Completed

1. ✅ Cache hit scenarios tested (same image returns cached result)
2. ✅ Idempotency with requestId tested
3. ✅ Integration tests added (`npm run test:integration`)
4. ✅ Rapid repeated requests handled consistently
5. ✅ Cross-platform same-image handling verified

## Phase 3 – Crawler Integration

**Status**: ✅ Complete

### Tasks

- [x] Clarify crawl scope and targets
- [x] Implement browser automation (Puppeteer with Nova Act-ready structure)
- [x] Connect crawler output to job creator
- [x] Verify end-to-end crawler → job creation → processing
- [x] Add retry logic for failed extractions

### Completed

1. ✅ Browser automation with Puppeteer (`packages/crawler/src/browser.ts`)
2. ✅ Base platform extractor class (`packages/crawler/src/platforms/base.ts`)
3. ✅ Netflix extractor (`packages/crawler/src/platforms/netflix.ts`)
4. ✅ TMDB extractor with API support (`packages/crawler/src/platforms/tmdb.ts`)
5. ✅ Demo extractor for testing without auth
6. ✅ Crawler test suite (`npm run test:crawler`)
7. ✅ Demo mode for testing: `npm run crawler:demo`

### Usage

```bash
# Run crawler in demo mode (no auth required)
npm run crawler:demo

# Run with TMDB API (set TMDB_API_KEY env var)
TMDB_API_KEY=your_key npm run crawler:run

# Test crawler
npm run test:crawler
```

## Phase 4 – Scheduling & Continuous Operation

**Status**: ✅ Complete

### Tasks

- [x] Wrap crawler in scheduled execution model
- [x] Define back-pressure and rate limits
- [x] Tune Lambda concurrency and SQS settings
- [x] Confirm system behavior under realistic load

### Completed

1. ✅ **Scheduler Lambda** (`packages/backend/src/scheduler/index.ts`)
   - EventBridge-triggered execution
   - Per-platform crawl orchestration
   - Back-pressure detection (queue depth monitoring)
   - Crawl history tracking in DynamoDB

2. ✅ **Rate Limiting & Back-Pressure** (`packages/backend/src/scheduler/config.ts`)
   - Configurable jobs per minute
   - Maximum jobs per cycle
   - Soft/hard queue depth limits
   - Throttle factor for gradual slowdown

3. ✅ **Lambda Concurrency Tuning**
   - Worker: 10 concurrent executions
   - Job Creator: 20 concurrent executions
   - Scheduler: 1 concurrent execution (singleton)

4. ✅ **SQS Configuration**
   - Visibility timeout: 5 minutes
   - Long polling: 20 seconds
   - Max receive count: 3 (then DLQ)
   - Batch size: 1 job at a time

5. ✅ **CloudWatch Alarms**
   - Queue depth alarm (threshold: 100)
   - DLQ message alarm (threshold: 5)
   - Worker error alarm
   - Scheduler error alarm
   - Worker duration alarm (approaching timeout)

6. ✅ **CloudWatch Dashboard**
   - SQS queue metrics
   - Lambda invocations and errors
   - Lambda duration percentiles

7. ✅ **Test Suite** (`npm run test:scheduler`)
   - Demo mode execution test
   - Back-pressure simulation
   - Rate limiting configuration
   - Platform configuration
   - Summary structure validation

### Configuration

```bash
# Environment Variables
MAX_QUEUE_DEPTH=100           # Back-pressure threshold
MAX_JOBS_PER_CYCLE=50         # Jobs per scheduler run
JOBS_PER_MINUTE=30            # Rate limit
MIN_CRAWL_INTERVAL_MINUTES=60 # Cooldown between crawls
USE_DEMO=true|false           # Demo mode for testing
ENABLED_PLATFORMS=NETFLIX,PRIME_VIDEO  # Platforms to crawl
```

### CDK Context Options

```bash
# Enable/disable scheduler
cdk deploy --context schedulerEnabled=true

# Custom schedule expression
cdk deploy --context scheduleExpression="rate(12 hours)"
```

### EventBridge Schedules

- Main schedule: Every 6 hours (configurable)
- Per-platform schedules available (disabled by default)

### API Endpoints

- `GET /scheduler` - Get scheduler status
- `POST /scheduler/trigger` - Manually trigger scheduler

## Phase 5 – Compliance Model & Policy Engine

**Status**: ✅ Complete

### Tasks

- [x] Choose model(s) for compliance checks
- [x] Define policy schema
- [x] Implement compliance engine layer
- [x] Add caching hooks at compliance layer
- [x] Document policy logic

### Completed

1. ✅ **Policy Schema** (`packages/backend/src/compliance/policy.ts`)
   - Violation codes (NUDITY, VIOLENCE, WEAPONS, DRUGS_ALCOHOL, etc.)
   - Severity levels (CRITICAL, HIGH, MEDIUM, LOW)
   - Configurable confidence thresholds
   - Default and Strict policy presets

2. ✅ **AWS Rekognition Integration** (`packages/backend/src/compliance/rekognition.ts`)
   - Content moderation using DetectModerationLabels API
   - Maps Rekognition labels to violation codes
   - Respects policy confidence thresholds
   - LocalStack support for local testing

3. ✅ **Mock Providers** (`packages/backend/src/compliance/mock.ts`)
   - MockComplianceChecker - Deterministic results for testing
   - AlwaysCompliantChecker - Always passes
   - AlwaysNonCompliantChecker - Always fails with violations

4. ✅ **Compliance Engine** (`packages/backend/src/compliance/index.ts`)
   - Factory function `createComplianceChecker()`
   - Configurable via environment variables
   - Auto-selects mock in local/test, Rekognition in production

5. ✅ **Worker Integration**
   - Worker Lambda now uses real compliance engine
   - Configurable via COMPLIANCE_PROVIDER and COMPLIANCE_POLICY env vars

6. ✅ **Test Suite** (`npm run test:compliance`)
   - 10 passing tests for all compliance components

### Model Options (Implemented)

- ✅ AWS Rekognition (content moderation) - Primary
- ⏸️ Amazon Bedrock (Claude/GPT-4 Vision) - Optional future enhancement
- ✅ Mock providers (for testing)

### Configuration

```bash
# Environment Variables
COMPLIANCE_PROVIDER=rekognition|mock|always-compliant|always-noncompliant
COMPLIANCE_POLICY=default|strict
USE_MOCK_COMPLIANCE=true|false  # Force mock mode
USE_REKOGNITION=true|false       # Force Rekognition mode
```

### Usage

```bash
# Run compliance tests
npm run test:compliance

# Test with mock provider (local development)
USE_MOCK_COMPLIANCE=true npm run test:e2e

# Test with Rekognition (requires AWS credentials)
USE_REKOGNITION=true npm run test:e2e
```

## Phase 6 – Observability, Operations & Demo Polish

**Status**: ✅ Complete

### Tasks

- [x] Add logging and tracing
- [x] Define metrics and dashboards
- [x] Configure alerts
- [x] Add minimal inspection interface
- [x] Finalize documentation

### Completed

1. ✅ **Structured Logger** (`packages/backend/src/observability/logger.ts`)
   - JSON-formatted logs for CloudWatch Logs Insights
   - Correlation ID tracking across requests
   - Log levels (DEBUG, INFO, WARN, ERROR)
   - Child loggers with context inheritance
   - Timer utilities for operation timing
   - Lambda context integration

2. ✅ **Custom CloudWatch Metrics** (`packages/backend/src/observability/metrics.ts`)
   - MetricsCollector for aggregating metrics
   - EMF (Embedded Metric Format) support
   - Standard metric names (jobs, compliance, cache, etc.)
   - Dimension support for filtering
   - Batch metric publishing

3. ✅ **AWS X-Ray Tracing** (`packages/backend/src/observability/tracing.ts`)
   - Tracer class for component tracing
   - Subsegment creation for operations
   - Annotation and metadata support
   - Handler wrapper for Lambda tracing
   - AWS SDK auto-instrumentation

4. ✅ **Admin/Inspection API** (`packages/backend/src/admin/index.ts`)
   - `GET /admin/stats` - System statistics
   - `GET /admin/jobs` - List recent jobs with filters
   - `GET /admin/health` - Health check endpoint
   - Queue depth monitoring
   - DynamoDB health checks

5. ✅ **CloudWatch Dashboard** (from Phase 4)
   - SQS queue metrics
   - Lambda invocations and errors
   - Lambda duration percentiles

6. ✅ **CloudWatch Alarms** (from Phase 4)
   - Queue depth alarm
   - DLQ message alarm
   - Worker/Scheduler error alarms
   - Duration alarm (approaching timeout)

7. ✅ **Test Suite** (`npm run test:observability`)
   - Logger tests (11 test cases)
   - Metrics tests
   - Tracing tests

### Configuration

```bash
# Environment Variables
LOG_LEVEL=DEBUG|INFO|WARN|ERROR  # Minimum log level
DISABLE_METRICS=true|false        # Disable metric publishing
```

### Usage

```typescript
import { createLogger, createMetricsCollector, createTracer } from '@safeart/backend';

// Structured logging
const logger = createLogger('my-component');
logger.setCorrelationId('request-123');
logger.info('Processing started', { jobId: 'job-456' });

// Custom metrics
const metrics = createMetricsCollector('worker');
metrics.count(MetricName.JOBS_COMPLETED);
metrics.duration(MetricName.PROCESSING_DURATION, 1500);
metrics.flushEMF();

// Tracing
const tracer = createTracer('compliance');
await tracer.trace('check-image', async () => {
  // ... operation
}, { imageHash: 'abc123' });
```

### API Endpoints

```bash
# System statistics
GET /admin/stats

# List recent jobs
GET /admin/jobs?status=COMPLETED&limit=50

# Health check
GET /admin/health
```

### CloudWatch Logs Insights Queries

```sql
-- Find errors by correlation ID
fields @timestamp, @message
| filter correlationId = 'abc123'
| sort @timestamp desc

-- Count jobs by status
fields @timestamp, data.status
| stats count(*) by data.status

-- Find slow operations
fields @timestamp, data.duration, message
| filter data.duration > 5000
| sort data.duration desc
```

## Current Focus

**All Phases Complete!** 🎉 The SafeArt system is fully implemented and production-ready.

## Progress Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Complete | Project & Architecture Setup |
| Phase 1 | ✅ Complete | Core Pipeline (Backend) Foundations |
| Phase 2 | ✅ Complete | Job Creation & Caching Logic |
| Phase 3 | ✅ Complete | Crawler Integration |
| Phase 4 | ✅ Complete | Scheduling & Continuous Operation |
| Phase 5 | ✅ Complete | Compliance Model & Policy Engine |
| Phase 6 | ✅ Complete | Observability, Operations & Demo Polish |

## Blockers

None! All phases are complete. The system is ready for production deployment.

## Next Steps (Optional Enhancements)

1. **Multi-region deployment** - Deploy to multiple AWS regions
2. **Custom ML model** - Train custom compliance model with Bedrock
3. **Real-time notifications** - WebSocket support for job updates
4. **Analytics dashboard** - React/Vue frontend for visualization

