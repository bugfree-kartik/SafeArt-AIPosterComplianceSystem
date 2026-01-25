# Quick Test Guide

The fastest way to test Safeart locally.

## Option 1: LocalStack (Fastest - No AWS Account Needed)

### Step 1: Install LocalStack

```bash
# macOS
brew install localstack/tap/localstack-cli

# Or using pip
pip install localstack
```

### Step 2: Start LocalStack

```bash
localstack start
```

Keep this terminal open. LocalStack will run on `http://localhost:4566`.

### Step 3: Setup Local Resources

```bash
npm run local:setup
```

This creates:
- DynamoDB table
- S3 bucket
- SQS queue

### Step 4: Set Environment Variables

```bash
export TABLE_NAME=safeart-jobs-dev
export S3_BUCKET=safeart-posters-local
export SQS_QUEUE_URL=http://localhost:4566/000000000000/safeart-jobs-dev
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

### Step 5: Build and Test

```bash
# Build all packages
npm run build

# Test job creation
npm run test:local:job-creator
```

You should see output like:
```
✅ Job creation successful!
Result: {
  "jobId": "abc123...",
  "status": "PENDING",
  "isCacheHit": false,
  "message": "Job created and queued for processing"
}
```

### Step 6: Test Worker

```bash
# Use the jobId from previous step
npm run test:local:worker <jobId>
```

## Option 2: Real AWS (Integration Testing)

### Step 1: Deploy Infrastructure

```bash
cd infrastructure
cdk bootstrap  # First time only
cdk deploy --context env=dev
```

### Step 2: Get Resource Names

From the CDK output, note:
- `PosterBucketName`
- `JobsTableName`
- `JobQueueUrl`

### Step 3: Set Environment Variables

```bash
export TABLE_NAME=<JobsTableName>
export S3_BUCKET=<PosterBucketName>
export SQS_QUEUE_URL=<JobQueueUrl>
export AWS_REGION=us-east-1
```

### Step 4: Build and Test

```bash
npm run build
npm run test:local:job-creator
```

## Verify Results

### Check DynamoDB

**LocalStack**:
```bash
aws dynamodb scan \
  --endpoint-url http://localhost:4566 \
  --table-name safeart-jobs-dev
```

**Real AWS**:
```bash
aws dynamodb scan --table-name safeart-jobs-dev
```

### Check S3

**LocalStack**:
```bash
aws s3 ls s3://safeart-posters-local --endpoint-url http://localhost:4566 --recursive
```

**Real AWS**:
```bash
aws s3 ls s3://<bucket-name> --recursive
```

### Check SQS

**LocalStack**:
```bash
aws sqs get-queue-attributes \
  --endpoint-url http://localhost:4566 \
  --queue-url http://localhost:4566/000000000000/safeart-jobs-dev \
  --attribute-names All
```

## Common Issues

### "LocalStack not running"
```bash
localstack start
```

### "Table not found"
```bash
npm run local:setup
```

### "Build errors"
```bash
npm install
npm run build
```

### "Permission denied" (setup script)
```bash
chmod +x scripts/setup-localstack.sh
```

## Next Steps

Once local testing works:
1. Deploy to AWS dev environment
2. Run integration tests
3. Test with real poster URLs
4. Monitor CloudWatch logs

See `docs/local-testing.md` for detailed information.

