/**
 * Local test script for worker Lambda
 * 
 * Usage:
 *   1. Create a job first using job-creator-test.ts
 *   2. Set environment variables
 *   3. Build: npm run build
 *   4. Run: node dist/test/worker-test.js
 */

import { handler } from '../worker';
import { SQSEvent } from 'aws-lambda';

async function main() {
  // Validate environment variables
  const requiredEnvVars = ['TABLE_NAME', 'S3_BUCKET'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('\nSet them with:');
    console.error('  export TABLE_NAME=safeart-jobs-dev');
    console.error('  export S3_BUCKET=safeart-posters-local');
    process.exit(1);
  }

  // Get jobId from command line or use default
  const jobId = process.argv[2] || 'test-job-123';
  const s3Key = process.argv[3] || 'posters/test/poster.jpg';
  const posterHash = process.argv[4] || 'test-hash-123';

  console.log('Environment:');
  console.log('  TABLE_NAME:', process.env.TABLE_NAME);
  console.log('  S3_BUCKET:', process.env.S3_BUCKET);
  console.log('  AWS_ENDPOINT_URL:', process.env.AWS_ENDPOINT_URL || 'default (real AWS)');
  console.log('');
  console.log('Processing job:');
  console.log('  jobId:', jobId);
  console.log('  s3Key:', s3Key);
  console.log('  posterHash:', posterHash);
  console.log('');

  // Create SQS event
  const event: SQSEvent = {
    Records: [
      {
        messageId: 'test-message-123',
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify({
          jobId,
          s3Bucket: process.env.S3_BUCKET,
          s3Key,
          posterHash,
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
        awsRegion: 'us-east-1',
      },
    ],
  };

  try {
    console.log('Processing job...');
    await handler(event);
    console.log('✅ Worker completed successfully!');
    console.log('\nCheck DynamoDB for updated job status');
  } catch (error) {
    console.error('❌ Worker failed:');
    console.error(error);
    process.exit(1);
  }
}

main();

