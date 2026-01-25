# Setup Instructions

## Current Status

✅ **Completed:**
- Dependencies installed
- Project built successfully
- All code compiled

⚠️ **Next Steps:**
- Install Docker Desktop (required for LocalStack)
- OR use real AWS services for testing

## Option 1: Install Docker for LocalStack (Recommended)

### Step 1: Install Docker Desktop

1. Download Docker Desktop for Mac:
   - Visit: https://www.docker.com/products/docker-desktop/
   - Download and install Docker Desktop

2. Start Docker Desktop:
   ```bash
   open -a Docker
   ```
   Wait for Docker to start (whale icon in menu bar should be steady)

### Step 2: Install LocalStack

Once Docker is running:

```bash
# Using pipx (recommended)
brew install pipx
pipx install localstack

# OR using pip with user flag
pip3 install --user localstack
```

### Step 3: Start LocalStack

```bash
localstack start
```

### Step 4: Setup and Test

```bash
# Setup local resources
npm run local:setup

# Test job creation
npm run test:local
```

## Option 2: Test with Real AWS (No Docker Needed)

If you have an AWS account, you can test directly with real AWS services:

### Step 1: Deploy Infrastructure

```bash
cd infrastructure
cdk bootstrap  # First time only
cdk deploy --context env=dev
```

### Step 2: Get Resource Names from Output

Note the values for:
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

### Step 4: Test

```bash
npm run test:local:job-creator
```

## Quick Decision Guide

**Choose LocalStack if:**
- You want to test without AWS costs
- You want fast iteration
- You don't have AWS account yet

**Choose Real AWS if:**
- You already have AWS account
- You want to test real infrastructure
- Docker installation is problematic

## What's Ready

All code is built and ready to test. You just need to choose:
1. Install Docker → Use LocalStack
2. Deploy to AWS → Use real services

Both approaches will work with the same test scripts!

