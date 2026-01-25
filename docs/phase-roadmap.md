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

**Status**: Not Started

### Tasks

- [ ] Wrap crawler in scheduled execution model
- [ ] Define back-pressure and rate limits
- [ ] Tune Lambda concurrency and SQS settings
- [ ] Confirm system behavior under realistic load

### Configuration

- EventBridge schedule (every 6 hours)
- Per-platform schedules if needed
- Rate limiting per platform
- Queue depth monitoring

## Phase 5 – Compliance Model & Policy Engine

**Status**: Not Started

### Tasks

- [ ] Choose model(s) for compliance checks
- [ ] Define policy schema
- [ ] Implement compliance engine layer
- [ ] Add caching hooks at compliance layer
- [ ] Document policy logic

### Model Options

- AWS Rekognition (content moderation)
- Amazon Bedrock (Claude/GPT-4 Vision)
- Custom vision models
- OCR for text analysis

## Phase 6 – Observability, Operations & Demo Polish

**Status**: Not Started

### Tasks

- [ ] Add logging and tracing
- [ ] Define metrics and dashboards
- [ ] Configure alerts
- [ ] Add minimal inspection interface
- [ ] Finalize documentation

### Observability Stack

- CloudWatch Logs (structured logging)
- CloudWatch Metrics (custom metrics)
- CloudWatch Alarms (DLQ, errors, latency)
- Optional: X-Ray for tracing

### Inspection Interface

Options:
- Internal API Gateway endpoints
- CLI tool
- Simple dashboard (React/Vue)
- AWS Console queries

## Current Focus

**Phase 4**: Scheduling & Continuous Operation - Automate crawler runs with EventBridge

## Blockers

None currently. Ready to proceed with Phase 4 (Scheduling) or Phase 5 (Compliance Models).

