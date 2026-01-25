#!/bin/bash

# Setup script for LocalStack
# Creates all necessary AWS resources locally

set -e

ENDPOINT_URL="http://localhost:4566"
REGION="us-east-1"

echo "Setting up LocalStack resources..."
echo "Endpoint: $ENDPOINT_URL"
echo ""

# Configure AWS CLI for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=$REGION

# Create DynamoDB table
echo "Creating DynamoDB table..."
aws dynamodb create-table \
  --endpoint-url $ENDPOINT_URL \
  --table-name safeart-jobs-dev \
  --attribute-definitions \
    AttributeName=jobId,AttributeType=S \
    AttributeName=posterHash,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes \
    'IndexName=PosterHashIndex,KeySchema=[{AttributeName=posterHash,KeyType=HASH}],Projection={ProjectionType=ALL}' \
    'IndexName=StatusIndex,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null || echo "Table may already exist"

echo "✅ DynamoDB table created"

# Create S3 bucket
echo "Creating S3 bucket..."
aws s3 mb s3://safeart-posters-local \
  --endpoint-url $ENDPOINT_URL \
  2>/dev/null || echo "Bucket may already exist"

echo "✅ S3 bucket created"

# Create SQS queue
echo "Creating SQS queue..."
QUEUE_URL=$(aws sqs create-queue \
  --endpoint-url $ENDPOINT_URL \
  --queue-name safeart-jobs-dev \
  --query 'QueueUrl' \
  --output text \
  2>/dev/null || aws sqs get-queue-url \
    --endpoint-url $ENDPOINT_URL \
    --queue-name safeart-jobs-dev \
    --query 'QueueUrl' \
    --output text)

echo "✅ SQS queue created: $QUEUE_URL"

# Create DLQ
echo "Creating Dead Letter Queue..."
DLQ_URL=$(aws sqs create-queue \
  --endpoint-url $ENDPOINT_URL \
  --queue-name safeart-jobs-dlq-dev \
  --query 'QueueUrl' \
  --output text \
  2>/dev/null || aws sqs get-queue-url \
    --endpoint-url $ENDPOINT_URL \
    --queue-name safeart-jobs-dlq-dev \
    --query 'QueueUrl' \
    --output text)

echo "✅ DLQ created: $DLQ_URL"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Set these environment variables:"
echo "  export TABLE_NAME=safeart-jobs-dev"
echo "  export S3_BUCKET=safeart-posters-local"
echo "  export SQS_QUEUE_URL=$QUEUE_URL"
echo "  export AWS_ENDPOINT_URL=$ENDPOINT_URL"
echo "  export AWS_ACCESS_KEY_ID=test"
echo "  export AWS_SECRET_ACCESS_KEY=test"
echo "  export AWS_DEFAULT_REGION=$REGION"

