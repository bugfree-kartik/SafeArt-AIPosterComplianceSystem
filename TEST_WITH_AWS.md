# Test with Real AWS (Recommended)

Since LocalStack is having Docker issues, let's test with real AWS services. This is actually better for integration testing!

## Quick Steps

### 1. Deploy Infrastructure

```bash
cd infrastructure
cdk bootstrap  # First time only
cdk deploy --context env=dev
```

### 2. Get Resource Names from Output

After deployment, note these values:
- `PosterBucketName`
- `JobsTableName`  
- `JobQueueUrl`

### 3. Set Environment Variables

```bash
export TABLE_NAME=<JobsTableName>
export S3_BUCKET=<PosterBucketName>
export SQS_QUEUE_URL=<JobQueueUrl>
export AWS_REGION=us-east-1
```

### 4. Test!

```bash
# Build (already done, but just in case)
npm run build

# Test job creation
npm run test:local:job-creator
```

You should see:
```
✅ Job creation successful!
Result: {
  "jobId": "...",
  "status": "PENDING",
  ...
}
```

### 5. Check Results

```bash
# Check DynamoDB
aws dynamodb scan --table-name <JobsTableName>

# Check S3
aws s3 ls s3://<PosterBucketName>/posters/ --recursive

# Check SQS
aws sqs get-queue-attributes --queue-url <JobQueueUrl> --attribute-names All
```

## Benefits of Real AWS

- ✅ No Docker issues
- ✅ Tests real infrastructure
- ✅ See actual AWS behavior
- ✅ Free tier covers testing

## Cost

For testing, you'll likely stay within AWS free tier:
- DynamoDB: 25 GB free
- S3: 5 GB free
- Lambda: 1M requests/month free
- SQS: 1M requests/month free

