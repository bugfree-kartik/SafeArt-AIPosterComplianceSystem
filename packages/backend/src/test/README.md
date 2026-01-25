# Local Testing Scripts

These scripts allow you to test Lambda functions locally without deploying to AWS.

## Prerequisites

1. **Build the project first**:
   ```bash
   npm run build
   ```

2. **Set environment variables** (choose one approach):

   ### Option A: LocalStack (Recommended)
   ```bash
   # Start LocalStack first
   localstack start
   
   # Run setup script
   npm run local:setup
   
   # Or set manually:
   export TABLE_NAME=safeart-jobs-dev
   export S3_BUCKET=safeart-posters-local
   export SQS_QUEUE_URL=http://localhost:4566/000000000000/safeart-jobs-dev
   export AWS_ENDPOINT_URL=http://localhost:4566
   export AWS_ACCESS_KEY_ID=test
   export AWS_SECRET_ACCESS_KEY=test
   export AWS_DEFAULT_REGION=us-east-1
   ```

   ### Option B: Real AWS (Integration Testing)
   ```bash
   # Deploy infrastructure first
   cd ../../infrastructure
   cdk deploy --context env=dev
   
   # Get values from stack outputs and set:
   export TABLE_NAME=safeart-jobs-dev
   export S3_BUCKET=<from-stack-output>
   export SQS_QUEUE_URL=<from-stack-output>
   export AWS_REGION=us-east-1
   ```

## Available Test Scripts

### 1. End-to-End Test (Recommended)

Comprehensive test that validates the complete pipeline:
- Environment validation
- Job creation
- Job retrieval
- SQS message reception
- Worker processing
- Cache hit verification
- Multiple job creation
- Error handling

```bash
npm run test:e2e
```

### 2. DLQ & Error Handling Tests

Tests error scenarios and DLQ functionality:
- Missing S3 objects
- Missing DynamoDB records
- Malformed messages
- Job status transitions on failure

```bash
npm run test:dlq
```

### 3. Integration Tests (Phase 2 Validation)

Tests cache, idempotency, and consistency:
- Cache hit after job processing
- Different images don't cache hit
- Same image across platforms
- Idempotency with requestId
- Rapid repeated requests handling
- Job status consistency

```bash
npm run test:integration
```

### 4. Run All Tests

```bash
npm run test:all
```

### 4. Individual Component Tests

**Job Creator Test** - Tests job creation flow:
```bash
npm run test:local:job-creator
```

**Worker Test** - Tests job processing:
```bash
npm run test:local:worker <jobId> <s3Key> <posterHash>
```

## Example Workflow

1. **Start LocalStack**:
   ```bash
   localstack start
   ```

2. **Setup resources**:
   ```bash
   npm run local:setup
   ```

3. **Build**:
   ```bash
   npm run build
   ```

4. **Run all tests**:
   ```bash
   npm run test:all
   ```

   Or run tests individually:
   ```bash
   npm run test:e2e    # End-to-end tests
   npm run test:dlq    # Error handling tests
   ```

## Test Coverage

| Test Suite | Coverage |
|------------|----------|
| E2E Test | Job creation, retrieval, SQS, worker processing, caching |
| DLQ Test | Error handling, status transitions, malformed messages |
| Integration Test | Cache hits, idempotency, consistency, rapid requests |

## Expected Output

### Successful E2E Test
```
============================================================
SafeArt End-to-End Test Suite
============================================================

✅ Environment Validation
✅ Job Creation
✅ Job Retrieval
✅ SQS Message Reception
✅ Worker Processing
✅ Cache Hit
✅ Multiple Job Creation
✅ Error Handling: Invalid URL
✅ Error Handling: Invalid Request

============================================================
TEST SUMMARY
============================================================
Total: 9 | Passed: 9 | Failed: 0
============================================================
```

### Successful DLQ Test
```
==================================================
SafeArt DLQ & Error Handling Tests
==================================================

✅ DLQ is accessible
✅ Worker handles missing S3 object
✅ Worker handles missing DynamoDB record
✅ Worker handles malformed SQS message
✅ Job status transitions to FAILED correctly

==================================================
DLQ TEST SUMMARY
==================================================
Total: 5 | Passed: 5 | Failed: 0
==================================================
```

## Troubleshooting

- **"Missing environment variables"**: Make sure you've set all required env vars
- **"Table not found"**: Run `npm run local:setup` or create resources manually
- **"Connection refused"**: Ensure LocalStack is running (`localstack start`)
- **"Access denied"**: Check AWS credentials (for real AWS) or LocalStack config
- **"No messages in queue"**: Run job-creator test first to populate the queue
