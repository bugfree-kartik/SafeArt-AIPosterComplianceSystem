/**
 * Dead Letter Queue (DLQ) Test Script
 * 
 * Tests error handling and DLQ functionality
 * 
 * Usage:
 *   1. Start LocalStack: localstack start
 *   2. Setup resources: npm run local:setup
 *   3. Set environment variables
 *   4. Build: npm run build
 *   5. Run: node dist/test/dlq-test.js
 */

import { handler as workerHandler } from '../worker';
import { SQSEvent } from 'aws-lambda';
import { SQSClient, ReceiveMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Job, JobStatus, Platform } from '@safeart/shared';

// Configure AWS clients
const awsConfig: {
  endpoint?: string;
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
} = {};

if (process.env.AWS_ENDPOINT_URL) {
  awsConfig.endpoint = process.env.AWS_ENDPOINT_URL;
  awsConfig.region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
  awsConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  };
}

const sqsClient = new SQSClient(awsConfig);
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig), {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.TABLE_NAME || 'safeart-jobs-dev';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const DLQ_URL = process.env.DLQ_URL || SQS_QUEUE_URL.replace('safeart-jobs-dev', 'safeart-jobs-dlq-dev');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const prefix = { info: '📋', success: '✅', error: '❌', warn: '⚠️' }[type];
  console.log(`${prefix} ${message}`);
}

/**
 * Create a test job directly in DynamoDB (for testing error scenarios)
 */
async function createTestJob(jobId: string, s3Key: string): Promise<Job> {
  const now = new Date().toISOString();
  const job: Job = {
    jobId,
    posterHash: `test-hash-${Date.now()}`,
    source: {
      platform: Platform.NETFLIX,
      url: 'https://example.com/test.jpg',
      discoveredAt: now,
    },
    metadata: { title: 'DLQ Test Job' },
    status: JobStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    s3Bucket: process.env.S3_BUCKET || 'safeart-posters-local',
    s3Key,
    cache: {
      posterHash: `test-hash-${Date.now()}`,
      isCacheHit: false,
    },
  };
  
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: job,
    })
  );
  
  return job;
}

/**
 * Get job from DynamoDB
 */
async function getJob(jobId: string): Promise<Job | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { jobId },
    })
  );
  return (result.Item as Job) || null;
}

/**
 * Get queue depth
 */
async function getQueueDepth(queueUrl: string): Promise<number> {
  try {
    const result = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
    );
    return parseInt(result.Attributes?.ApproximateNumberOfMessages || '0');
  } catch {
    return -1;
  }
}

/**
 * Test 1: Worker fails gracefully on missing S3 object
 */
async function testMissingS3Object() {
  const testName = 'Worker handles missing S3 object';
  log(`Running: ${testName}`);
  
  try {
    const jobId = `dlq-test-missing-s3-${Date.now()}`;
    const s3Key = 'nonexistent/path/to/image.jpg';
    
    // Create job in DynamoDB
    await createTestJob(jobId, s3Key);
    
    // Create SQS event with non-existent S3 key
    const event: SQSEvent = {
      Records: [{
        messageId: 'test-msg-1',
        receiptHandle: 'test-receipt-1',
        body: JSON.stringify({
          jobId,
          s3Bucket: process.env.S3_BUCKET || 'safeart-posters-local',
          s3Key,
          posterHash: 'test-hash',
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'test-arn',
        awsRegion: 'us-east-1',
      }],
    };
    
    // Worker should throw an error
    let errorThrown = false;
    try {
      await workerHandler(event);
    } catch {
      errorThrown = true;
    }
    
    // Verify job status was updated to FAILED
    const job = await getJob(jobId);
    
    if (!job) {
      throw new Error('Job not found in DynamoDB');
    }
    
    if (job.status !== JobStatus.FAILED) {
      throw new Error(`Expected FAILED status but got ${job.status}`);
    }
    
    if (!job.error) {
      throw new Error('Job should have error information');
    }
    
    if (!errorThrown) {
      throw new Error('Worker should have thrown error for DLQ routing');
    }
    
    log(`${testName}: PASSED`, 'success');
    testResults.push({ name: testName, passed: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`${testName}: FAILED - ${msg}`, 'error');
    testResults.push({ name: testName, passed: false, error: msg });
  }
}

/**
 * Test 2: Worker fails gracefully on missing DynamoDB record
 */
async function testMissingDynamoDBRecord() {
  const testName = 'Worker handles missing DynamoDB record';
  log(`Running: ${testName}`);
  
  try {
    const jobId = `nonexistent-job-${Date.now()}`;
    
    // Create SQS event with non-existent job ID
    const event: SQSEvent = {
      Records: [{
        messageId: 'test-msg-2',
        receiptHandle: 'test-receipt-2',
        body: JSON.stringify({
          jobId,
          s3Bucket: process.env.S3_BUCKET || 'safeart-posters-local',
          s3Key: 'some/path.jpg',
          posterHash: 'test-hash',
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'test-arn',
        awsRegion: 'us-east-1',
      }],
    };
    
    // Worker should throw an error
    let errorThrown = false;
    let errorMessage = '';
    try {
      await workerHandler(event);
    } catch (error) {
      errorThrown = true;
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    if (!errorThrown) {
      throw new Error('Worker should have thrown error for missing job');
    }
    
    if (!errorMessage.includes('not found')) {
      throw new Error(`Expected "not found" error but got: ${errorMessage}`);
    }
    
    log(`${testName}: PASSED`, 'success');
    testResults.push({ name: testName, passed: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`${testName}: FAILED - ${msg}`, 'error');
    testResults.push({ name: testName, passed: false, error: msg });
  }
}

/**
 * Test 3: Worker handles malformed SQS message
 */
async function testMalformedMessage() {
  const testName = 'Worker handles malformed SQS message';
  log(`Running: ${testName}`);
  
  try {
    // Create SQS event with invalid JSON
    const event: SQSEvent = {
      Records: [{
        messageId: 'test-msg-3',
        receiptHandle: 'test-receipt-3',
        body: 'not valid json {{{',
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'test-arn',
        awsRegion: 'us-east-1',
      }],
    };
    
    // Worker should throw an error
    let errorThrown = false;
    try {
      await workerHandler(event);
    } catch {
      errorThrown = true;
    }
    
    if (!errorThrown) {
      throw new Error('Worker should have thrown error for malformed message');
    }
    
    log(`${testName}: PASSED`, 'success');
    testResults.push({ name: testName, passed: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`${testName}: FAILED - ${msg}`, 'error');
    testResults.push({ name: testName, passed: false, error: msg });
  }
}

/**
 * Test 4: Check DLQ accessibility
 */
async function testDLQAccessibility() {
  const testName = 'DLQ is accessible';
  log(`Running: ${testName}`);
  
  try {
    const depth = await getQueueDepth(DLQ_URL);
    
    if (depth === -1) {
      throw new Error(`Could not access DLQ at ${DLQ_URL}`);
    }
    
    log(`DLQ depth: ${depth} messages`, 'info');
    log(`${testName}: PASSED`, 'success');
    testResults.push({ name: testName, passed: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`${testName}: FAILED - ${msg}`, 'error');
    testResults.push({ name: testName, passed: false, error: msg });
  }
}

/**
 * Test 5: Job status transitions correctly on failure
 */
async function testJobStatusTransition() {
  const testName = 'Job status transitions to FAILED correctly';
  log(`Running: ${testName}`);
  
  try {
    const jobId = `dlq-status-test-${Date.now()}`;
    const s3Key = 'nonexistent/status-test.jpg';
    
    // Create job in PENDING state
    const job = await createTestJob(jobId, s3Key);
    
    if (job.status !== JobStatus.PENDING) {
      throw new Error(`Initial status should be PENDING, got ${job.status}`);
    }
    
    // Try to process (should fail)
    const event: SQSEvent = {
      Records: [{
        messageId: 'test-msg-status',
        receiptHandle: 'test-receipt-status',
        body: JSON.stringify({
          jobId,
          s3Bucket: process.env.S3_BUCKET || 'safeart-posters-local',
          s3Key,
          posterHash: job.posterHash,
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: Date.now().toString(),
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: Date.now().toString(),
        },
        messageAttributes: {},
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'test-arn',
        awsRegion: 'us-east-1',
      }],
    };
    
    try {
      await workerHandler(event);
    } catch {
      // Expected to fail
    }
    
    // Verify status transition
    const updatedJob = await getJob(jobId);
    
    if (!updatedJob) {
      throw new Error('Job not found after processing');
    }
    
    if (updatedJob.status !== JobStatus.FAILED) {
      throw new Error(`Expected FAILED status but got ${updatedJob.status}`);
    }
    
    if (!updatedJob.error) {
      throw new Error('Job should have error details');
    }
    
    if (!updatedJob.error.code || !updatedJob.error.message) {
      throw new Error('Error should have code and message');
    }
    
    log(`${testName}: PASSED`, 'success');
    testResults.push({ name: testName, passed: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`${testName}: FAILED - ${msg}`, 'error');
    testResults.push({ name: testName, passed: false, error: msg });
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('DLQ TEST SUMMARY');
  console.log('='.repeat(50));
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  
  for (const result of testResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`       └─ ${result.error}`);
    }
  }
  
  console.log('='.repeat(50));
  console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(50));
  
  return failed === 0;
}

/**
 * Main
 */
async function main() {
  console.log('\n' + '='.repeat(50));
  console.log('SafeArt DLQ & Error Handling Tests');
  console.log('='.repeat(50) + '\n');
  
  // Validate environment
  const requiredVars = ['TABLE_NAME', 'S3_BUCKET'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log(`Missing environment variables: ${missing.join(', ')}`, 'error');
    process.exit(1);
  }
  
  log(`TABLE_NAME: ${process.env.TABLE_NAME}`, 'info');
  log(`S3_BUCKET: ${process.env.S3_BUCKET}`, 'info');
  log(`DLQ_URL: ${DLQ_URL}`, 'info');
  console.log('');
  
  // Run tests
  await testDLQAccessibility();
  await testMissingS3Object();
  await testMissingDynamoDBRecord();
  await testMalformedMessage();
  await testJobStatusTransition();
  
  // Summary
  const success = printSummary();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
