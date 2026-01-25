# Local Testing Guide

This guide covers different approaches to test Safeart locally before deploying to AWS.

## Prerequisites

- Node.js 18+
- AWS CLI configured (for real AWS testing)
- Docker (for LocalStack option)

## Approach 1: LocalStack (Recommended for Full Local Testing)

LocalStack simulates AWS services locally using Docker.

### Setup LocalStack

1. **Install LocalStack**:
   ```bash
   pip install localstack
   # OR
   brew install localstack/tap/localstack-cli
   ```

2. **Start LocalStack**:
   ```bash
   localstack start
   ```

3. **Configure AWS CLI to use LocalStack**:
   ```bash
   export AWS_ENDPOINT_URL=http://localhost:4566
   export AWS_ACCESS_KEY_ID=test
   export AWS_SECRET_ACCESS_KEY=test
   export AWS_DEFAULT_REGION=us-east-1
   ```

### Create Local Resources

Use the provided script to create local resources:

```bash
npm run local:setup
```

Or manually:

```bash
# Create DynamoDB table
aws dynamodb create-table \
  --endpoint-url http://localhost:4566 \
  --table-name safeart-jobs-dev \
  --attribute-definitions \
    AttributeName=jobId,AttributeType=S \
    AttributeName=posterHash,AttributeType=S \
    AttributeName=status,AttributeType=S \
  --key-schema \
    AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes \
    IndexName=PosterHashIndex,KeySchema=[{AttributeName=posterHash,KeyType=HASH}],Projection={ProjectionType=ALL} \
    IndexName=StatusIndex,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL} \
  --billing-mode PAY_PER_REQUEST

# Create S3 bucket
aws s3 mb s3://safeart-posters-local --endpoint-url http://localhost:4566

# Create SQS queue
aws sqs create-queue \
  --endpoint-url http://localhost:4566 \
  --queue-name safeart-jobs-dev
```

### Run Tests with LocalStack

```bash
# Set environment variables
export TABLE_NAME=safeart-jobs-dev
export S3_BUCKET=safeart-posters-local
export SQS_QUEUE_URL=http://localhost:4566/000000000000/safeart-jobs-dev
export AWS_ENDPOINT_URL=http://localhost:4566

# Run job creator test
npm run test:local:job-creator

# Run worker test
npm run test:local:worker
```

## Approach 2: Real AWS Services (Recommended for Integration Testing)

Test against real AWS services but run code locally.

### Setup

1. **Deploy infrastructure to AWS** (dev environment):
   ```bash
   cd infrastructure
   cdk deploy --context env=dev
   ```

2. **Get resource names from stack outputs**:
   - `PosterBucketName`
   - `JobsTableName`
   - `JobQueueUrl`

3. **Set environment variables**:
   ```bash
   export TABLE_NAME=safeart-jobs-dev
   export S3_BUCKET=<from-stack-output>
   export SQS_QUEUE_URL=<from-stack-output>
   export AWS_REGION=us-east-1
   ```

### Test Job Creator

```bash
cd packages/backend
npm run test:local:job-creator
```

Or use the test script:

```bash
node dist/test/job-creator-test.js
```

### Test Worker

1. **Create a test job first** (using job creator)
2. **Send message to SQS manually**:
   ```bash
   aws sqs send-message \
     --queue-url $SQS_QUEUE_URL \
     --message-body '{"jobId":"test-123","s3Bucket":"'$S3_BUCKET'","s3Key":"posters/test/poster.jpg","posterHash":"abc123"}'
   ```

3. **Run worker locally**:
   ```bash
   cd packages/backend
   npm run test:local:worker
   ```

## Approach 3: Unit Tests with Mocks

Test individual functions with mocked AWS services.

### Run Unit Tests

```bash
npm test
```

### Example Test Structure

See `packages/backend/src/__tests__/` for example tests.

## Testing Individual Components

### 1. Test Job Creator Function

Create a test file: `packages/backend/src/test/job-creator-test.ts`

```typescript
import { createJob } from '../job-creator';
import { Platform } from '@safeart/shared';

async function testJobCreator() {
  const request = {
    platform: Platform.NETFLIX,
    posterUrl: 'https://example.com/poster.jpg',
    metadata: {
      title: 'Test Movie',
      releaseYear: 2024,
    },
  };

  try {
    const result = await createJob(request);
    console.log('Job created:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testJobCreator();
```

Run it:
```bash
cd packages/backend
npm run build
node dist/test/job-creator-test.js
```

### 2. Test Worker Function

Create a test file: `packages/backend/src/test/worker-test.ts`

```typescript
import { handler } from '../worker';
import { SQSEvent } from 'aws-lambda';

async function testWorker() {
  const event: SQSEvent = {
    Records: [
      {
        messageId: 'test-123',
        receiptHandle: 'test',
        body: JSON.stringify({
          jobId: 'test-job-123',
          s3Bucket: process.env.S3_BUCKET,
          s3Key: 'posters/test/poster.jpg',
          posterHash: 'abc123',
        }),
        attributes: {},
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test',
        awsRegion: 'us-east-1',
      },
    ],
  };

  try {
    await handler(event);
    console.log('Worker completed');
  } catch (error) {
    console.error('Error:', error);
  }
}

testWorker();
```

### 3. Test API Endpoint

Use a local server or test directly:

```bash
# Using curl (after deploying API Gateway)
curl -X POST https://<api-endpoint>/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "NETFLIX",
    "posterUrl": "https://example.com/poster.jpg",
    "metadata": {
      "title": "Test Movie"
    }
  }'
```

Or use a local API server (see below).

## Local API Server (Optional)

For testing the API locally without API Gateway:

Create `packages/backend/src/test/local-server.ts`:

```typescript
import express from 'express';
import { createJobHandler } from '../api';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

const app = express();
app.use(express.json());

app.post('/jobs', async (req, res) => {
  const event: APIGatewayProxyEvent = {
    body: JSON.stringify(req.body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/jobs',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '/jobs',
  };

  const context: Context = {} as Context;

  const result = await createJobHandler(event, context, () => {});
  
  res.status(result.statusCode).json(JSON.parse(result.body));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Local API server running on http://localhost:${PORT}`);
});
```

Run it:
```bash
cd packages/backend
npm install express @types/express
npm run build
node dist/test/local-server.js
```

## Testing the Crawler

```bash
cd packages/crawler

# Set environment variables
export PLATFORM=NETFLIX
export MAX_TITLES=10
export TABLE_NAME=safeart-jobs-dev
export S3_BUCKET=safeart-posters-local
export SQS_QUEUE_URL=http://localhost:4566/000000000000/safeart-jobs-dev

# Run crawler
npm run dev
```

## Debugging Tips

1. **Enable verbose logging**:
   ```bash
   export DEBUG=*
   ```

2. **Check LocalStack logs**:
   ```bash
   localstack logs
   ```

3. **Inspect DynamoDB**:
   ```bash
   aws dynamodb scan \
     --endpoint-url http://localhost:4566 \
     --table-name safeart-jobs-dev
   ```

4. **Check SQS messages**:
   ```bash
   aws sqs receive-message \
     --endpoint-url http://localhost:4566 \
     --queue-url http://localhost:4566/000000000000/safeart-jobs-dev
   ```

5. **List S3 objects**:
   ```bash
   aws s3 ls s3://safeart-posters-local --endpoint-url http://localhost:4566 --recursive
   ```

## Quick Test Script

Add to `package.json`:

```json
{
  "scripts": {
    "test:local": "npm run test:local:job-creator && npm run test:local:worker",
    "test:local:job-creator": "cd packages/backend && node dist/test/job-creator-test.js",
    "test:local:worker": "cd packages/backend && node dist/test/worker-test.js",
    "local:setup": "node scripts/setup-localstack.js"
  }
}
```

## Troubleshooting

### LocalStack Issues

- **Port conflicts**: Change LocalStack ports in `~/.localstack/config`
- **Docker not running**: Ensure Docker Desktop is running
- **Resource creation fails**: Check LocalStack logs

### AWS SDK Issues

- **Credentials**: Ensure AWS credentials are configured
- **Region**: Set `AWS_REGION` environment variable
- **Endpoint**: For LocalStack, set `AWS_ENDPOINT_URL`

### TypeScript Issues

- **Build first**: Always run `npm run build` before testing
- **Type errors**: Check `tsconfig.json` settings

## Next Steps

After local testing passes:
1. Deploy to AWS dev environment
2. Run integration tests
3. Test with real data
4. Monitor CloudWatch logs

