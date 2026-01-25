# AWS Setup Guide - Step by Step

## Prerequisites Checklist

✅ **AWS CLI** - Installed (v2.22.4)
❌ **AWS Credentials** - Need to configure
❌ **AWS CDK** - Need to install
✅ **Node.js** - Installed
✅ **Project** - Built and ready

## Step-by-Step Setup

### Step 1: Configure AWS Credentials

You need AWS credentials to deploy and test. Choose one method:

#### Option A: AWS Access Keys (Recommended for testing)

1. **Get AWS Access Keys:**
   - Go to AWS Console: https://console.aws.amazon.com/
   - Click your username → "Security credentials"
   - Scroll to "Access keys" → "Create access key"
   - Choose "Command Line Interface (CLI)"
   - Download or copy the Access Key ID and Secret Access Key

2. **Configure AWS CLI:**
   ```bash
   aws configure
   ```
   
   Enter when prompted:
   - **AWS Access Key ID**: [paste your key]
   - **AWS Secret Access Key**: [paste your secret]
   - **Default region name**: `us-east-1` (or your preferred region)
   - **Default output format**: `json`

3. **Verify it works:**
   ```bash
   aws sts get-caller-identity
   ```
   
   Should show your AWS account ID and user ARN.

#### Option B: AWS Profiles (If you have multiple accounts)

```bash
aws configure --profile safeart-dev
# Enter credentials as above
export AWS_PROFILE=safeart-dev
```

### Step 2: Install AWS CDK

```bash
npm install -g aws-cdk
```

Verify installation:
```bash
cdk --version
```

### Step 3: Bootstrap CDK (First Time Only)

CDK needs to create a "bootstrap stack" in your AWS account:

```bash
cd infrastructure
cdk bootstrap
```

This will:
- Create an S3 bucket for CDK assets
- Create IAM roles for deployment
- Take 2-3 minutes

**Note:** You only need to do this once per AWS account/region.

### Step 4: Deploy Infrastructure

Deploy all AWS resources (DynamoDB, S3, SQS, Lambda):

```bash
cd infrastructure
cdk deploy --context env=dev
```

**What this creates:**
- DynamoDB table: `safeart-jobs-dev`
- S3 bucket: `safeart-posters-<account>-<region>`
- SQS queue: `safeart-jobs-dev`
- Lambda functions (Job Creator, Worker)
- API Gateway (optional)

**Time:** ~5-10 minutes for first deployment

**Cost:** Should be within free tier for testing

### Step 5: Get Resource Names

After deployment, CDK will output:

```
Outputs:
SafeartStack-dev.PosterBucketName = safeart-posters-123456789012-us-east-1
SafeartStack-dev.JobsTableName = safeart-jobs-dev
SafeartStack-dev.JobQueueUrl = https://sqs.us-east-1.amazonaws.com/123456789012/safeart-jobs-dev
SafeartStack-dev.ApiEndpoint = https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
```

**Copy these values!** You'll need them next.

### Step 6: Set Environment Variables

```bash
export TABLE_NAME=safeart-jobs-dev
export S3_BUCKET=safeart-posters-123456789012-us-east-1  # Use your actual bucket name
export SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/safeart-jobs-dev  # Use your actual URL
export AWS_REGION=us-east-1
```

**Or create a `.env` file** (don't commit this!):

```bash
# packages/backend/.env
TABLE_NAME=safeart-jobs-dev
S3_BUCKET=safeart-posters-123456789012-us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/safeart-jobs-dev
AWS_REGION=us-east-1
```

### Step 7: Test!

```bash
# Make sure you're in the project root
npm run build  # Already done, but just in case

# Test job creation
npm run test:local:job-creator
```

**Expected output:**
```
Environment:
  TABLE_NAME: safeart-jobs-dev
  S3_BUCKET: safeart-posters-...
  SQS_QUEUE_URL: https://sqs...
  AWS_ENDPOINT_URL: default (real AWS)

Creating test job...
✅ Job creation successful!
Result: {
  "jobId": "abc123...",
  "status": "PENDING",
  "isCacheHit": false,
  "message": "Job created and queued for processing"
}
```

### Step 8: Verify in AWS Console

Check that everything worked:

1. **DynamoDB:**
   - Go to: https://console.aws.amazon.com/dynamodb/
   - Click "Tables" → `safeart-jobs-dev`
   - Click "Explore table items"
   - You should see your job!

2. **S3:**
   - Go to: https://console.aws.amazon.com/s3/
   - Click your bucket
   - Navigate to `posters/` folder
   - You should see the uploaded poster image!

3. **SQS:**
   - Go to: https://console.aws.amazon.com/sqs/
   - Click your queue
   - Check "Messages available" - should show 1

4. **Lambda:**
   - Go to: https://console.aws.amazon.com/lambda/
   - Check "WorkerLambda" - it should process the message automatically
   - Check CloudWatch logs for execution

## Quick Command Reference

```bash
# Configure AWS
aws configure

# Install CDK
npm install -g aws-cdk

# Bootstrap (first time)
cd infrastructure && cdk bootstrap

# Deploy
cdk deploy --context env=dev

# Test
export TABLE_NAME=... && export S3_BUCKET=... && export SQS_QUEUE_URL=...
npm run test:local:job-creator

# Check DynamoDB
aws dynamodb scan --table-name safeart-jobs-dev

# Check S3
aws s3 ls s3://safeart-posters-.../posters/ --recursive

# Destroy (when done testing)
cdk destroy --context env=dev
```

## Troubleshooting

### "InvalidClientTokenId"
- AWS credentials not configured correctly
- Run `aws configure` again

### "CDK not found"
- Install: `npm install -g aws-cdk`
- Or use: `npx aws-cdk`

### "Bootstrap stack not found"
- Run `cdk bootstrap` first

### "Access Denied"
- Your AWS user needs permissions for:
  - CloudFormation
  - S3, DynamoDB, SQS, Lambda
  - IAM (for creating roles)
- Ask your AWS admin to grant these permissions

### "Region not available"
- Choose a different region: `us-west-2`, `eu-west-1`, etc.
- Update in `aws configure` and CDK context

## Cost Estimate

For testing/development:
- **DynamoDB**: Free tier (25 GB storage, 25 read/write units)
- **S3**: Free tier (5 GB storage, 20K GET requests)
- **Lambda**: Free tier (1M requests/month)
- **SQS**: Free tier (1M requests/month)
- **API Gateway**: Free tier (1M requests/month)

**Total for testing: ~$0-1/month**

## Next Steps After Testing

1. Test worker Lambda (processes jobs from SQS)
2. Test API Gateway endpoint
3. Monitor CloudWatch logs
4. Check job completion in DynamoDB

Ready to start? Begin with **Step 1: Configure AWS Credentials**!

