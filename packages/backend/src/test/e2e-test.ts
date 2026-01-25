/**
 * End-to-End Test Script for SafeArt Pipeline
 * 
 * Tests the complete flow: Job Creation → S3 → DynamoDB → SQS → Worker → DynamoDB Update
 * 
 * Usage:
 *   1. Start LocalStack: localstack start
 *   2. Setup resources: npm run local:setup
 *   3. Set environment variables
 *   4. Build: npm run build
 *   5. Run: node dist/test/e2e-test.js
 */

import { createJob, getJob } from '../job-creator';
import { handler as workerHandler } from '../worker';
import { Platform, JobStatus, Job, JobMessage } from '@safeart/shared';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { SQSEvent } from 'aws-lambda';

// Test configuration
const TEST_IMAGES = [
  {
    name: 'Random Image 1',
    url: 'https://picsum.photos/seed/safeart1/300/450',
    platform: Platform.NETFLIX,
  },
  {
    name: 'Random Image 2', 
    url: 'https://picsum.photos/seed/safeart2/300/450',
    platform: Platform.PRIME_VIDEO,
  },
  {
    name: 'Random Image 3',
    url: 'https://picsum.photos/seed/safeart3/300/450',
    platform: Platform.DISNEY_PLUS,
  },
];

// Configure SQS client
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
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

const testResults: TestResult[] = [];

/**
 * Helper to log with timestamp
 */
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warn: '⚠️',
  }[type];
  console.log(`${timestamp} ${prefix} ${message}`);
}

/**
 * Run a single test
 */
async function runTest(
  name: string,
  testFn: () => Promise<Record<string, unknown> | void>
): Promise<TestResult> {
  const startTime = Date.now();
  log(`Running test: ${name}`, 'info');
  
  try {
    const details = await testFn();
    const duration = Date.now() - startTime;
    log(`Test passed: ${name} (${duration}ms)`, 'success');
    return { name, passed: true, duration, details: details || {} };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Test failed: ${name} - ${errorMessage}`, 'error');
    return { name, passed: false, duration, error: errorMessage };
  }
}

/**
 * Test 1: Environment Validation
 */
async function testEnvironment(): Promise<Record<string, unknown>> {
  const requiredVars = ['TABLE_NAME', 'S3_BUCKET', 'SQS_QUEUE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  
  return {
    TABLE_NAME: process.env.TABLE_NAME,
    S3_BUCKET: process.env.S3_BUCKET,
    SQS_QUEUE_URL: process.env.SQS_QUEUE_URL,
    AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL || 'AWS (production)',
  };
}

/**
 * Test 2: Job Creation
 */
async function testJobCreation(): Promise<Record<string, unknown>> {
  const testImage = TEST_IMAGES[0];
  
  const request = {
    platform: testImage.platform,
    posterUrl: testImage.url,
    metadata: {
      title: testImage.name,
      releaseYear: 2024,
      genre: ['Test'],
    },
  };
  
  const response = await createJob(request);
  
  if (!response.jobId) {
    throw new Error('Job creation did not return jobId');
  }
  
  if (response.status !== JobStatus.PENDING && response.status !== JobStatus.CACHED) {
    throw new Error(`Unexpected status: ${response.status}`);
  }
  
  return {
    jobId: response.jobId,
    status: response.status,
    isCacheHit: response.isCacheHit,
  };
}

/**
 * Test 3: Job Retrieval
 */
async function testJobRetrieval(jobId: string): Promise<Record<string, unknown>> {
  const job = await getJob(jobId);
  
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  if (job.jobId !== jobId) {
    throw new Error(`Job ID mismatch: expected ${jobId}, got ${job.jobId}`);
  }
  
  return {
    jobId: job.jobId,
    status: job.status,
    posterHash: job.posterHash,
    s3Key: job.s3Key,
  };
}

/**
 * Test 4: SQS Message Reception
 */
async function testSQSMessage(): Promise<Record<string, unknown>> {
  const response = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    })
  );
  
  if (!response.Messages || response.Messages.length === 0) {
    throw new Error('No messages in queue');
  }
  
  const message = response.Messages[0];
  const body: JobMessage = JSON.parse(message.Body || '{}');
  
  if (!body.jobId || !body.s3Key || !body.posterHash) {
    throw new Error('Invalid message format');
  }
  
  return {
    messageId: message.MessageId,
    jobId: body.jobId,
    s3Key: body.s3Key,
    receiptHandle: message.ReceiptHandle,
  };
}

/**
 * Test 5: Worker Processing
 */
async function testWorkerProcessing(
  jobId: string,
  s3Key: string,
  posterHash: string,
  receiptHandle?: string
): Promise<Record<string, unknown>> {
  // Create mock SQS event
  const event: SQSEvent = {
    Records: [
      {
        messageId: 'test-message',
        receiptHandle: receiptHandle || 'test-receipt',
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
        md5OfBody: 'test',
        eventSource: 'aws:sqs',
        eventSourceARN: 'test-arn',
        awsRegion: 'us-east-1',
      },
    ],
  };
  
  // Process the job
  await workerHandler(event);
  
  // Verify job was updated
  const job = await getJob(jobId);
  
  if (!job) {
    throw new Error(`Job not found after processing: ${jobId}`);
  }
  
  if (job.status !== JobStatus.COMPLETED) {
    throw new Error(`Job not completed: status is ${job.status}`);
  }
  
  if (!job.result) {
    throw new Error('Job has no result');
  }
  
  // Delete the message from the queue if we have a receipt handle
  if (receiptHandle) {
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle,
      })
    );
  }
  
  return {
    jobId: job.jobId,
    status: job.status,
    isCompliant: job.result.isCompliant,
    processingDurationMs: job.processingDurationMs,
  };
}

/**
 * Test 6: Cache Hit
 */
async function testCacheHit(): Promise<Record<string, unknown>> {
  const testImage = TEST_IMAGES[0]; // Same image as test 2
  
  const request = {
    platform: testImage.platform,
    posterUrl: testImage.url,
    metadata: {
      title: testImage.name,
      releaseYear: 2024,
      genre: ['Test'],
    },
  };
  
  const response = await createJob(request);
  
  if (!response.isCacheHit) {
    throw new Error('Expected cache hit but got cache miss');
  }
  
  if (response.status !== JobStatus.CACHED) {
    throw new Error(`Expected CACHED status but got ${response.status}`);
  }
  
  return {
    jobId: response.jobId,
    status: response.status,
    isCacheHit: response.isCacheHit,
    cachedJobId: response.cachedJobId,
  };
}

/**
 * Test 7: Multiple Job Creation
 */
async function testMultipleJobs(): Promise<Record<string, unknown>> {
  const jobs: Array<{ jobId: string; platform: string; status: string }> = [];
  
  for (const testImage of TEST_IMAGES.slice(1)) { // Skip first (already processed)
    const request = {
      platform: testImage.platform,
      posterUrl: testImage.url,
      metadata: {
        title: testImage.name,
        releaseYear: 2024,
        genre: ['Test'],
      },
    };
    
    const response = await createJob(request);
    jobs.push({
      jobId: response.jobId,
      platform: testImage.platform,
      status: response.status,
    });
  }
  
  return { jobsCreated: jobs.length, jobs };
}

/**
 * Test 8: Error Handling - Invalid URL
 */
async function testErrorHandlingInvalidUrl(): Promise<Record<string, unknown>> {
  const request = {
    platform: Platform.NETFLIX,
    posterUrl: 'https://invalid-url-that-does-not-exist.com/image.jpg',
    metadata: {
      title: 'Error Test',
    },
  };
  
  try {
    await createJob(request);
    throw new Error('Expected error but job creation succeeded');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expected error')) {
      throw error;
    }
    // Error was expected
    return {
      errorCaught: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test 9: Error Handling - Invalid Request (missing required fields)
 */
async function testErrorHandlingInvalidRequest(): Promise<Record<string, unknown>> {
  const request = {
    platform: Platform.NETFLIX,
    posterUrl: '', // Empty URL
    metadata: {
      title: '',  // Empty title
    },
  };
  
  try {
    await createJob(request);
    throw new Error('Expected validation error but job creation succeeded');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expected validation')) {
      throw error;
    }
    // Error was expected
    return {
      errorCaught: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  for (const result of testResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`       └─ ${result.error}`);
    }
  }
  
  console.log('='.repeat(60));
  console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log('='.repeat(60));
  
  return failed === 0;
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('SafeArt End-to-End Test Suite');
  console.log('='.repeat(60) + '\n');
  
  let createdJobId: string | undefined;
  let s3Key: string | undefined;
  let posterHash: string | undefined;
  let receiptHandle: string | undefined;
  
  // Test 1: Environment
  testResults.push(await runTest('Environment Validation', testEnvironment));
  if (!testResults[testResults.length - 1].passed) {
    printSummary();
    process.exit(1);
  }
  
  // Test 2: Job Creation
  const jobCreationResult = await runTest('Job Creation', testJobCreation);
  testResults.push(jobCreationResult);
  if (jobCreationResult.passed && jobCreationResult.details) {
    createdJobId = jobCreationResult.details.jobId as string;
  }
  
  // Test 3: Job Retrieval
  if (createdJobId) {
    const retrievalResult = await runTest('Job Retrieval', () => testJobRetrieval(createdJobId!));
    testResults.push(retrievalResult);
    if (retrievalResult.passed && retrievalResult.details) {
      s3Key = retrievalResult.details.s3Key as string;
      posterHash = retrievalResult.details.posterHash as string;
    }
  } else {
    testResults.push({
      name: 'Job Retrieval',
      passed: false,
      duration: 0,
      error: 'Skipped: No job ID from previous test',
    });
  }
  
  // Test 4: SQS Message
  const sqsResult = await runTest('SQS Message Reception', testSQSMessage);
  testResults.push(sqsResult);
  if (sqsResult.passed && sqsResult.details) {
    receiptHandle = sqsResult.details.receiptHandle as string;
    // Use values from SQS message if not already set
    if (!s3Key) s3Key = sqsResult.details.s3Key as string;
  }
  
  // Test 5: Worker Processing
  if (createdJobId && s3Key && posterHash) {
    testResults.push(
      await runTest('Worker Processing', () =>
        testWorkerProcessing(createdJobId!, s3Key!, posterHash!, receiptHandle)
      )
    );
  } else {
    testResults.push({
      name: 'Worker Processing',
      passed: false,
      duration: 0,
      error: 'Skipped: Missing job data from previous tests',
    });
  }
  
  // Test 6: Cache Hit
  testResults.push(await runTest('Cache Hit', testCacheHit));
  
  // Test 7: Multiple Jobs
  testResults.push(await runTest('Multiple Job Creation', testMultipleJobs));
  
  // Test 8: Error Handling - Invalid URL
  testResults.push(await runTest('Error Handling: Invalid URL', testErrorHandlingInvalidUrl));
  
  // Test 9: Error Handling - Invalid Request
  testResults.push(await runTest('Error Handling: Invalid Request', testErrorHandlingInvalidRequest));
  
  // Print summary
  const allPassed = printSummary();
  process.exit(allPassed ? 0 : 1);
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
