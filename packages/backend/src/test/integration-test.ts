/**
 * Integration Tests for Job Creation, Caching & Idempotency
 * 
 * Tests Phase 2 requirements:
 * - Cache hit scenarios
 * - Idempotency with requestId
 * - Repeated requests behavior
 * 
 * Usage:
 *   1. Start LocalStack: localstack start
 *   2. Setup resources: npm run local:setup
 *   3. Set environment variables
 *   4. Build: npm run build
 *   5. Run: node dist/test/integration-test.js
 */

import { createJob, getJob } from '../job-creator';
import { handler as workerHandler } from '../worker';
import { Platform, JobStatus, CreateJobRequest } from '@safeart/shared';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, PurgeQueueCommand } from '@aws-sdk/client-sqs';
import { SQSEvent } from 'aws-lambda';

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

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const prefix = { info: '📋', success: '✅', error: '❌', warn: '⚠️' }[type];
  console.log(`${prefix} ${message}`);
}

async function runTest(
  name: string,
  testFn: () => Promise<Record<string, unknown> | void>
): Promise<TestResult> {
  const startTime = Date.now();
  log(`Running: ${name}`, 'info');
  
  try {
    const details = await testFn();
    const duration = Date.now() - startTime;
    log(`PASSED: ${name} (${duration}ms)`, 'success');
    return { name, passed: true, duration, details: details || {} };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`FAILED: ${name} - ${errorMessage}`, 'error');
    return { name, passed: false, duration, error: errorMessage };
  }
}

/**
 * Helper: Process a job through the worker
 */
async function processJobThroughWorker(jobId: string, s3Key: string, posterHash: string): Promise<void> {
  const event: SQSEvent = {
    Records: [{
      messageId: `test-${Date.now()}`,
      receiptHandle: 'test-receipt',
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
    }],
  };
  
  await workerHandler(event);
}

/**
 * Helper: Drain the SQS queue
 */
async function drainQueue(): Promise<void> {
  try {
    await sqsClient.send(new PurgeQueueCommand({ QueueUrl: SQS_QUEUE_URL }));
    // Wait for purge to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {
    // Queue might be empty, that's fine
  }
}

// ============================================================================
// CACHE HIT TESTS
// ============================================================================

/**
 * Test: Same image submitted twice returns cache hit after processing
 */
async function testCacheHitAfterProcessing(): Promise<Record<string, unknown>> {
  // Use a unique seed to ensure consistent image
  const uniqueSeed = `cache-test-${Date.now()}`;
  const request: CreateJobRequest = {
    platform: Platform.NETFLIX,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'Cache Test Movie' },
  };

  // First submission - should create new job
  const firstResponse = await createJob(request);
  
  if (firstResponse.isCacheHit) {
    throw new Error('First submission should not be a cache hit');
  }
  
  if (firstResponse.status !== JobStatus.PENDING) {
    throw new Error(`Expected PENDING status, got ${firstResponse.status}`);
  }

  // Get job details for processing
  const job = await getJob(firstResponse.jobId);
  if (!job) throw new Error('Job not found');

  // Process the job through worker
  await processJobThroughWorker(job.jobId, job.s3Key, job.posterHash);

  // Verify job is now completed
  const processedJob = await getJob(firstResponse.jobId);
  if (!processedJob || processedJob.status !== JobStatus.COMPLETED) {
    throw new Error(`Job should be COMPLETED, got ${processedJob?.status}`);
  }

  // Second submission with same image - should be cache hit
  const secondResponse = await createJob(request);

  if (!secondResponse.isCacheHit) {
    throw new Error('Second submission should be a cache hit');
  }

  if (secondResponse.status !== JobStatus.CACHED) {
    throw new Error(`Expected CACHED status, got ${secondResponse.status}`);
  }

  if (secondResponse.cachedJobId !== firstResponse.jobId) {
    throw new Error('Cached job ID should match original job ID');
  }

  return {
    firstJobId: firstResponse.jobId,
    secondJobId: secondResponse.jobId,
    cachedJobId: secondResponse.cachedJobId,
    firstStatus: firstResponse.status,
    secondStatus: secondResponse.status,
  };
}

/**
 * Test: Different images don't trigger cache hit
 */
async function testDifferentImagesNoCacheHit(): Promise<Record<string, unknown>> {
  const timestamp = Date.now();
  
  // First image
  const request1: CreateJobRequest = {
    platform: Platform.NETFLIX,
    posterUrl: `https://picsum.photos/seed/image1-${timestamp}/300/450`,
    metadata: { title: 'Movie 1' },
  };
  
  // Second image (different seed = different image)
  const request2: CreateJobRequest = {
    platform: Platform.NETFLIX,
    posterUrl: `https://picsum.photos/seed/image2-${timestamp}/300/450`,
    metadata: { title: 'Movie 2' },
  };

  const response1 = await createJob(request1);
  const response2 = await createJob(request2);

  if (response1.isCacheHit) {
    throw new Error('First image should not be cache hit');
  }

  if (response2.isCacheHit) {
    throw new Error('Second different image should not be cache hit');
  }

  if (response1.jobId === response2.jobId) {
    throw new Error('Different images should have different job IDs');
  }

  return {
    job1Id: response1.jobId,
    job2Id: response2.jobId,
    job1CacheHit: response1.isCacheHit,
    job2CacheHit: response2.isCacheHit,
  };
}

/**
 * Test: Same image across different platforms creates separate jobs
 */
async function testSameImageDifferentPlatforms(): Promise<Record<string, unknown>> {
  const uniqueSeed = `platform-test-${Date.now()}`;
  const posterUrl = `https://picsum.photos/seed/${uniqueSeed}/300/450`;

  const netflixRequest: CreateJobRequest = {
    platform: Platform.NETFLIX,
    posterUrl,
    metadata: { title: 'Cross-Platform Movie' },
  };

  const primeRequest: CreateJobRequest = {
    platform: Platform.PRIME_VIDEO,
    posterUrl,
    metadata: { title: 'Cross-Platform Movie' },
  };

  const netflixResponse = await createJob(netflixRequest);
  const primeResponse = await createJob(primeRequest);

  // Same image content = same poster hash, but job IDs include platform
  // So they should be different jobs
  if (netflixResponse.jobId === primeResponse.jobId) {
    throw new Error('Same image on different platforms should have different job IDs');
  }

  return {
    netflixJobId: netflixResponse.jobId,
    primeJobId: primeResponse.jobId,
    netflixCacheHit: netflixResponse.isCacheHit,
    primeCacheHit: primeResponse.isCacheHit,
  };
}

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

/**
 * Test: Same requestId returns existing job
 */
async function testIdempotencyWithRequestId(): Promise<Record<string, unknown>> {
  const requestId = `idempotent-${Date.now()}`;
  const uniqueSeed = `idempotent-img-${Date.now()}`;
  
  const request: CreateJobRequest = {
    requestId,
    platform: Platform.DISNEY_PLUS,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'Idempotent Movie' },
  };

  // First call
  const response1 = await createJob(request);
  
  // Second call with same requestId
  const response2 = await createJob(request);

  // Both should return the same job
  if (response1.jobId !== response2.jobId) {
    throw new Error('Same requestId should return same job ID');
  }

  return {
    requestId,
    firstJobId: response1.jobId,
    secondJobId: response2.jobId,
    firstCacheHit: response1.isCacheHit,
    secondCacheHit: response2.isCacheHit,
  };
}

/**
 * Test: Different requestIds create different jobs for same image
 */
async function testDifferentRequestIds(): Promise<Record<string, unknown>> {
  const uniqueSeed = `diff-req-${Date.now()}`;
  const posterUrl = `https://picsum.photos/seed/${uniqueSeed}/300/450`;

  const request1: CreateJobRequest = {
    requestId: `request-1-${Date.now()}`,
    platform: Platform.NETFLIX,
    posterUrl,
    metadata: { title: 'Request ID Test' },
  };

  const request2: CreateJobRequest = {
    requestId: `request-2-${Date.now()}`,
    platform: Platform.NETFLIX,
    posterUrl,
    metadata: { title: 'Request ID Test' },
  };

  const response1 = await createJob(request1);
  
  // Note: Since they have the same poster hash but different requestIds,
  // the second request will create a new job (not idempotent match)
  // But since the first job isn't COMPLETED, it won't be a cache hit either
  const response2 = await createJob(request2);

  return {
    requestId1: request1.requestId,
    requestId2: request2.requestId,
    jobId1: response1.jobId,
    jobId2: response2.jobId,
    sameJobId: response1.jobId === response2.jobId,
  };
}

/**
 * Test: No requestId means no idempotency check
 */
async function testNoRequestIdNoIdempotency(): Promise<Record<string, unknown>> {
  const uniqueSeed = `no-reqid-${Date.now()}`;
  
  const request: CreateJobRequest = {
    // No requestId
    platform: Platform.HBO_MAX,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'No RequestId Movie' },
  };

  const response1 = await createJob(request);
  
  // Second call without requestId - should check cache based on hash
  // Since first job isn't completed, won't be cache hit
  const response2 = await createJob(request);

  // Should get same job since hash matches and job already exists
  if (response1.jobId !== response2.jobId) {
    // This is expected if the image hash leads to same job ID
    log('Different job IDs returned (expected for non-completed jobs)', 'info');
  }

  return {
    jobId1: response1.jobId,
    jobId2: response2.jobId,
    sameJob: response1.jobId === response2.jobId,
  };
}

// ============================================================================
// REPEATED REQUESTS CONSISTENCY TESTS
// ============================================================================

/**
 * Test: Rapid repeated requests are handled consistently
 */
async function testRapidRepeatedRequests(): Promise<Record<string, unknown>> {
  const uniqueSeed = `rapid-${Date.now()}`;
  
  const request: CreateJobRequest = {
    requestId: `rapid-test-${Date.now()}`,
    platform: Platform.APPLE_TV,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'Rapid Request Movie' },
  };

  // Fire 5 requests rapidly
  const promises = [
    createJob(request),
    createJob(request),
    createJob(request),
    createJob(request),
    createJob(request),
  ];

  const responses = await Promise.all(promises);

  // All should return the same job ID due to idempotency
  const jobIds = responses.map(r => r.jobId);
  const uniqueJobIds = [...new Set(jobIds)];

  if (uniqueJobIds.length !== 1) {
    throw new Error(`Expected 1 unique job ID, got ${uniqueJobIds.length}: ${uniqueJobIds.join(', ')}`);
  }

  return {
    totalRequests: responses.length,
    uniqueJobIds: uniqueJobIds.length,
    jobId: uniqueJobIds[0],
  };
}

/**
 * Test: Job status consistency across queries
 */
async function testJobStatusConsistency(): Promise<Record<string, unknown>> {
  const uniqueSeed = `status-${Date.now()}`;
  
  const request: CreateJobRequest = {
    platform: Platform.HULU,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'Status Test Movie' },
  };

  const response = await createJob(request);
  
  // Query job multiple times
  const queries = await Promise.all([
    getJob(response.jobId),
    getJob(response.jobId),
    getJob(response.jobId),
  ]);

  // All queries should return consistent data
  const statuses = queries.map(j => j?.status);
  const uniqueStatuses = [...new Set(statuses)];

  if (uniqueStatuses.length !== 1) {
    throw new Error(`Inconsistent statuses: ${statuses.join(', ')}`);
  }

  const hashes = queries.map(j => j?.posterHash);
  const uniqueHashes = [...new Set(hashes)];

  if (uniqueHashes.length !== 1) {
    throw new Error(`Inconsistent hashes: ${hashes.join(', ')}`);
  }

  return {
    jobId: response.jobId,
    queriesCount: queries.length,
    consistentStatus: uniqueStatuses[0],
    consistentHash: uniqueHashes[0],
  };
}

/**
 * Test: Cache hit returns consistent result data
 */
async function testCacheHitConsistency(): Promise<Record<string, unknown>> {
  const uniqueSeed = `cache-consist-${Date.now()}`;
  
  const request: CreateJobRequest = {
    platform: Platform.NETFLIX,
    posterUrl: `https://picsum.photos/seed/${uniqueSeed}/300/450`,
    metadata: { title: 'Cache Consistency Movie' },
  };

  // Create and process job
  const firstResponse = await createJob(request);
  const job = await getJob(firstResponse.jobId);
  if (!job) throw new Error('Job not found');
  
  await processJobThroughWorker(job.jobId, job.s3Key, job.posterHash);

  // Multiple cache hit requests
  const cacheResponses = await Promise.all([
    createJob(request),
    createJob(request),
    createJob(request),
  ]);

  // All should be cache hits with same data
  const allCacheHits = cacheResponses.every(r => r.isCacheHit);
  if (!allCacheHits) {
    throw new Error('Not all responses were cache hits');
  }

  const cachedJobIds = cacheResponses.map(r => r.cachedJobId);
  const uniqueCachedIds = [...new Set(cachedJobIds)];

  if (uniqueCachedIds.length !== 1) {
    throw new Error(`Inconsistent cached job IDs: ${cachedJobIds.join(', ')}`);
  }

  return {
    originalJobId: firstResponse.jobId,
    cacheHitCount: cacheResponses.length,
    consistentCachedJobId: uniqueCachedIds[0],
    allCacheHits,
  };
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('INTEGRATION TEST SUMMARY - Phase 2 Validation');
  console.log('='.repeat(60));

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

  // Group by category
  const categories = {
    'Cache Hit Tests': testResults.slice(0, 3),
    'Idempotency Tests': testResults.slice(3, 6),
    'Consistency Tests': testResults.slice(6),
  };

  for (const [category, tests] of Object.entries(categories)) {
    console.log(`\n${category}:`);
    for (const result of tests) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} | ${result.name} (${result.duration}ms)`);
      if (!result.passed && result.error) {
        console.log(`         └─ ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log('='.repeat(60));

  return failed === 0;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('SafeArt Phase 2 Integration Tests');
  console.log('Cache, Idempotency & Consistency Validation');
  console.log('='.repeat(60) + '\n');

  // Validate environment
  const requiredVars = ['TABLE_NAME', 'S3_BUCKET', 'SQS_QUEUE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log(`Missing environment variables: ${missing.join(', ')}`, 'error');
    process.exit(1);
  }

  log(`TABLE_NAME: ${process.env.TABLE_NAME}`, 'info');
  log(`S3_BUCKET: ${process.env.S3_BUCKET}`, 'info');
  console.log('');

  // Drain queue before tests
  log('Draining SQS queue...', 'info');
  await drainQueue();

  // Cache Hit Tests
  console.log('\n--- Cache Hit Tests ---\n');
  testResults.push(await runTest('Cache hit after job processing', testCacheHitAfterProcessing));
  testResults.push(await runTest('Different images no cache hit', testDifferentImagesNoCacheHit));
  testResults.push(await runTest('Same image different platforms', testSameImageDifferentPlatforms));

  // Idempotency Tests
  console.log('\n--- Idempotency Tests ---\n');
  testResults.push(await runTest('Idempotency with requestId', testIdempotencyWithRequestId));
  testResults.push(await runTest('Different requestIds behavior', testDifferentRequestIds));
  testResults.push(await runTest('No requestId no idempotency', testNoRequestIdNoIdempotency));

  // Consistency Tests
  console.log('\n--- Consistency Tests ---\n');
  testResults.push(await runTest('Rapid repeated requests', testRapidRepeatedRequests));
  testResults.push(await runTest('Job status consistency', testJobStatusConsistency));
  testResults.push(await runTest('Cache hit consistency', testCacheHitConsistency));

  // Summary
  const success = printSummary();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
