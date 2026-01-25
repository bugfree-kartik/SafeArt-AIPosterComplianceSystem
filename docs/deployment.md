# Deployment Guide

## Prerequisites

1. **Node.js 18+** installed
2. **AWS CLI** configured with appropriate credentials
3. **AWS CDK CLI** installed globally:
   ```bash
   npm install -g aws-cdk
   ```
4. **AWS Account** with permissions to create:
   - Lambda functions
   - DynamoDB tables
   - S3 buckets
   - SQS queues
   - API Gateway
   - EventBridge rules
   - IAM roles and policies

## Initial Setup

### 1. Install Dependencies

From the project root:

```bash
npm install
```

This will install dependencies for all workspace packages.

### 2. Build All Packages

```bash
npm run build
```

This compiles TypeScript in all packages.

### 3. Bootstrap CDK (First Time Only)

CDK requires bootstrapping in each AWS account/region:

```bash
cd infrastructure
cdk bootstrap
```

## Deployment

### Development Environment

```bash
cd infrastructure
cdk deploy --context env=dev
```

### Production Environment

```bash
cd infrastructure
cdk deploy --context env=prod
```

### Deploy Specific Stack

```bash
cdk deploy SafeartStack-dev
```

## Environment Configuration

The stack uses context variables to configure environments:

- `env`: Environment name (dev, prod, etc.)
- Set via `--context env=dev` or in `cdk.json`

## Post-Deployment

After deployment, note the stack outputs:

- **PosterBucketName**: S3 bucket for poster images
- **JobsTableName**: DynamoDB table name
- **JobQueueUrl**: SQS queue URL
- **ApiEndpoint**: API Gateway endpoint (if enabled)

## Local Development

### Running the Crawler Locally

```bash
cd packages/crawler
npm run dev
```

Set environment variables:
```bash
export PLATFORM=NETFLIX
export MAX_TITLES=10
export TABLE_NAME=safeart-jobs-dev
export S3_BUCKET=safeart-posters-...
export SQS_QUEUE_URL=https://sqs...
```

### Testing Job Creation

Use the API Gateway endpoint or call the Lambda directly:

```bash
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

## Updating Infrastructure

After making changes to CDK code:

1. **Synthesize** to check for errors:
   ```bash
   cdk synth
   ```

2. **Diff** to see changes:
   ```bash
   cdk diff
   ```

3. **Deploy**:
   ```bash
   cdk deploy
   ```

## Troubleshooting

### CDK Bootstrap Issues

If you see bootstrap errors:
```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Lambda Build Issues

Ensure all packages are built before deploying:
```bash
npm run build
```

### Permission Errors

Ensure your AWS credentials have sufficient permissions. The CDK needs permissions to create and manage all resources.

## Cleanup

To destroy the stack:

```bash
cdk destroy
```

**Warning**: This will delete all resources including DynamoDB tables and S3 buckets (unless they have `removalPolicy: RETAIN`).

## CI/CD Integration

For automated deployments, you can:

1. Add CDK deployment to your CI/CD pipeline
2. Use AWS CodePipeline with CDK actions
3. Use GitHub Actions with AWS credentials

Example GitHub Actions workflow:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm install -g aws-cdk
      - run: cdk deploy --require-approval never
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

