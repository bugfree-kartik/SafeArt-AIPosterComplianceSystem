/**
 * Scheduler Lambda
 * 
 * Triggered by EventBridge to run crawlers on a schedule.
 * Handles rate limiting, back-pressure, and per-platform configuration.
 */

import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ScheduledEvent, Context } from 'aws-lambda';
import { Platform } from '@safeart/shared';

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
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Environment variables
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const TABLE_NAME = process.env.TABLE_NAME || '';
const SCHEDULER_TABLE_NAME = process.env.SCHEDULER_TABLE_NAME || '';

/**
 * Scheduler configuration for rate limiting and back-pressure
 */
export interface SchedulerConfig {
  // Maximum queue depth before applying back-pressure
  maxQueueDepth: number;
  // Maximum jobs to submit per crawl cycle
  maxJobsPerCycle: number;
  // Minimum interval between crawls per platform (in minutes)
  minCrawlIntervalMinutes: number;
  // Rate limit: jobs per minute
  jobsPerMinute: number;
  // Platforms to crawl
  platforms: Platform[];
  // Use demo mode (no auth required)
  useDemo: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxQueueDepth: 100,
  maxJobsPerCycle: 50,
  minCrawlIntervalMinutes: 60,
  jobsPerMinute: 30,
  platforms: [Platform.NETFLIX],
  useDemo: true,
};

/**
 * Platform-specific configuration overrides
 */
export interface PlatformConfig {
  platform: Platform;
  enabled: boolean;
  maxTitles: number;
  scheduleExpression?: string; // Override default schedule
  rateLimitPerMinute?: number; // Override default rate limit
}

/**
 * Default platform configurations
 */
export const PLATFORM_CONFIGS: PlatformConfig[] = [
  { platform: Platform.NETFLIX, enabled: true, maxTitles: 50 },
  { platform: Platform.PRIME_VIDEO, enabled: false, maxTitles: 50 },
  { platform: Platform.DISNEY_PLUS, enabled: false, maxTitles: 50 },
  { platform: Platform.HULU, enabled: false, maxTitles: 30 },
  { platform: Platform.HBO_MAX, enabled: false, maxTitles: 30 },
  { platform: Platform.APPLE_TV, enabled: false, maxTitles: 30 },
];

/**
 * Scheduler run record for tracking crawl history
 */
export interface SchedulerRun {
  runId: string;
  platform: Platform;
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  postersDiscovered: number;
  jobsSubmitted: number;
  cacheHits: number;
  errors: number;
  skippedReason?: string;
}

/**
 * Get current queue depth from SQS
 */
async function getQueueDepth(): Promise<number> {
  if (!SQS_QUEUE_URL) {
    console.log('No SQS queue URL configured, returning 0');
    return 0;
  }

  try {
    const response = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: SQS_QUEUE_URL,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      })
    );

    const visible = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10);
    const notVisible = parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10);

    return visible + notVisible;
  } catch (error) {
    console.error('Error getting queue depth:', error);
    return 0;
  }
}

/**
 * Check if back-pressure should be applied
 */
async function shouldApplyBackPressure(config: SchedulerConfig): Promise<{ apply: boolean; queueDepth: number }> {
  const queueDepth = await getQueueDepth();
  const apply = queueDepth >= config.maxQueueDepth;

  if (apply) {
    console.log(`Back-pressure applied: queue depth ${queueDepth} >= max ${config.maxQueueDepth}`);
  }

  return { apply, queueDepth };
}

/**
 * Get the last run time for a platform
 */
async function getLastRunTime(platform: Platform): Promise<Date | null> {
  if (!SCHEDULER_TABLE_NAME) {
    return null;
  }

  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: SCHEDULER_TABLE_NAME,
        KeyConditionExpression: '#platform = :platform',
        ExpressionAttributeNames: { '#platform': 'platform' },
        ExpressionAttributeValues: { ':platform': platform },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    if (response.Items && response.Items.length > 0) {
      return new Date(response.Items[0].startedAt);
    }
  } catch (error) {
    console.error('Error getting last run time:', error);
  }

  return null;
}

/**
 * Check if enough time has passed since last crawl
 */
async function canCrawlPlatform(platform: Platform, config: SchedulerConfig): Promise<{ canCrawl: boolean; reason?: string }> {
  const lastRun = await getLastRunTime(platform);
  
  if (!lastRun) {
    return { canCrawl: true };
  }

  const minIntervalMs = config.minCrawlIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - lastRun.getTime();

  if (elapsed < minIntervalMs) {
    const remainingMinutes = Math.ceil((minIntervalMs - elapsed) / 60000);
    return {
      canCrawl: false,
      reason: `Too soon since last crawl. Wait ${remainingMinutes} more minutes.`,
    };
  }

  return { canCrawl: true };
}

/**
 * Save scheduler run record
 */
async function saveSchedulerRun(run: SchedulerRun): Promise<void> {
  if (!SCHEDULER_TABLE_NAME) {
    console.log('No scheduler table configured, skipping run record save');
    return;
  }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: SCHEDULER_TABLE_NAME,
        Item: run,
      })
    );
  } catch (error) {
    console.error('Error saving scheduler run:', error);
  }
}

/**
 * Calculate jobs to submit based on rate limiting
 */
function calculateJobsToSubmit(
  discovered: number,
  config: SchedulerConfig,
  queueDepth: number
): number {
  // Calculate available capacity
  const availableCapacity = Math.max(0, config.maxQueueDepth - queueDepth);
  
  // Apply rate limit
  const rateLimited = Math.min(discovered, config.jobsPerMinute);
  
  // Apply max jobs per cycle
  const cycleLimit = Math.min(rateLimited, config.maxJobsPerCycle);
  
  // Apply available capacity
  return Math.min(cycleLimit, availableCapacity);
}

/**
 * Result from crawling a platform
 */
export interface CrawlResult {
  platform: Platform;
  success: boolean;
  postersDiscovered: number;
  jobsSubmitted: number;
  cacheHits: number;
  errors: number;
  skipped: boolean;
  skippedReason?: string;
  duration: number;
}

/**
 * Simulate crawling a platform (for demo/testing)
 * In production, this would invoke the actual crawler
 */
async function crawlPlatform(
  platform: Platform,
  config: SchedulerConfig,
  platformConfig: PlatformConfig,
  queueDepth: number
): Promise<CrawlResult> {
  const startTime = Date.now();
  const runId = `${platform}-${Date.now()}`;

  console.log(`\n🚀 Starting crawl for platform: ${platform}`);
  console.log(`   Mode: ${config.useDemo ? 'Demo' : 'Live'}`);
  console.log(`   Max titles: ${platformConfig.maxTitles}`);

  // Create initial run record
  const run: SchedulerRun = {
    runId,
    platform,
    startedAt: new Date().toISOString(),
    status: 'RUNNING',
    postersDiscovered: 0,
    jobsSubmitted: 0,
    cacheHits: 0,
    errors: 0,
  };

  try {
    // Check if we can crawl
    const crawlCheck = await canCrawlPlatform(platform, config);
    if (!crawlCheck.canCrawl) {
      console.log(`   ⏭️ Skipped: ${crawlCheck.reason}`);
      run.status = 'SKIPPED';
      run.skippedReason = crawlCheck.reason;
      await saveSchedulerRun(run);

      return {
        platform,
        success: true,
        postersDiscovered: 0,
        jobsSubmitted: 0,
        cacheHits: 0,
        errors: 0,
        skipped: true,
        skippedReason: crawlCheck.reason,
        duration: Date.now() - startTime,
      };
    }

    // In demo mode, simulate discovery
    if (config.useDemo) {
      // Simulate discovering some posters
      const discovered = Math.min(platformConfig.maxTitles, 10);
      const toSubmit = calculateJobsToSubmit(discovered, config, queueDepth);
      
      // Simulate some cache hits and submissions
      const cacheHits = Math.floor(toSubmit * 0.3);
      const submitted = toSubmit - cacheHits;

      console.log(`   📊 Demo mode - simulated results:`);
      console.log(`      Discovered: ${discovered}`);
      console.log(`      Would submit: ${submitted}`);
      console.log(`      Cache hits: ${cacheHits}`);

      run.status = 'COMPLETED';
      run.completedAt = new Date().toISOString();
      run.postersDiscovered = discovered;
      run.jobsSubmitted = submitted;
      run.cacheHits = cacheHits;
      await saveSchedulerRun(run);

      return {
        platform,
        success: true,
        postersDiscovered: discovered,
        jobsSubmitted: submitted,
        cacheHits,
        errors: 0,
        skipped: false,
        duration: Date.now() - startTime,
      };
    }

    // Production mode - actually run the crawler
    // This would typically invoke the crawler package
    // For now, we'll log that this is where production crawling would happen
    console.log(`   🔧 Production mode - crawler invocation would happen here`);
    console.log(`   Note: Implement crawler invocation for production use`);

    run.status = 'COMPLETED';
    run.completedAt = new Date().toISOString();
    await saveSchedulerRun(run);

    return {
      platform,
      success: true,
      postersDiscovered: 0,
      jobsSubmitted: 0,
      cacheHits: 0,
      errors: 0,
      skipped: false,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`   ❌ Crawl failed:`, error);
    
    run.status = 'FAILED';
    run.completedAt = new Date().toISOString();
    run.errors = 1;
    await saveSchedulerRun(run);

    return {
      platform,
      success: false,
      postersDiscovered: 0,
      jobsSubmitted: 0,
      cacheHits: 0,
      errors: 1,
      skipped: false,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Get scheduler configuration from environment
 */
function getSchedulerConfig(): SchedulerConfig {
  const config: SchedulerConfig = { ...DEFAULT_SCHEDULER_CONFIG };

  if (process.env.MAX_QUEUE_DEPTH) {
    config.maxQueueDepth = parseInt(process.env.MAX_QUEUE_DEPTH, 10);
  }
  if (process.env.MAX_JOBS_PER_CYCLE) {
    config.maxJobsPerCycle = parseInt(process.env.MAX_JOBS_PER_CYCLE, 10);
  }
  if (process.env.MIN_CRAWL_INTERVAL_MINUTES) {
    config.minCrawlIntervalMinutes = parseInt(process.env.MIN_CRAWL_INTERVAL_MINUTES, 10);
  }
  if (process.env.JOBS_PER_MINUTE) {
    config.jobsPerMinute = parseInt(process.env.JOBS_PER_MINUTE, 10);
  }
  if (process.env.USE_DEMO === 'true' || process.env.USE_DEMO === '1') {
    config.useDemo = true;
  }
  if (process.env.USE_DEMO === 'false' || process.env.USE_DEMO === '0') {
    config.useDemo = false;
  }
  if (process.env.PLATFORMS) {
    config.platforms = process.env.PLATFORMS.split(',').map((p) => p.trim() as Platform);
  }

  return config;
}

/**
 * Get platform-specific configuration
 */
function getPlatformConfigs(): PlatformConfig[] {
  const configs = [...PLATFORM_CONFIGS];

  // Override from environment
  if (process.env.ENABLED_PLATFORMS) {
    const enabled = process.env.ENABLED_PLATFORMS.split(',').map((p) => p.trim());
    for (const config of configs) {
      config.enabled = enabled.includes(config.platform);
    }
  }

  return configs;
}

/**
 * Scheduler summary
 */
export interface SchedulerSummary {
  startTime: string;
  endTime: string;
  duration: number;
  queueDepthBefore: number;
  backPressureApplied: boolean;
  platformsProcessed: number;
  totalDiscovered: number;
  totalSubmitted: number;
  totalCacheHits: number;
  totalErrors: number;
  totalSkipped: number;
  results: CrawlResult[];
}

/**
 * Run the scheduler
 */
export async function runScheduler(): Promise<SchedulerSummary> {
  const startTime = new Date();
  console.log('\n' + '='.repeat(60));
  console.log('📅 SAFEART SCHEDULER');
  console.log('='.repeat(60));
  console.log(`Started at: ${startTime.toISOString()}`);

  const config = getSchedulerConfig();
  const platformConfigs = getPlatformConfigs();

  console.log('\nConfiguration:');
  console.log(`   Max queue depth: ${config.maxQueueDepth}`);
  console.log(`   Max jobs/cycle: ${config.maxJobsPerCycle}`);
  console.log(`   Min crawl interval: ${config.minCrawlIntervalMinutes} min`);
  console.log(`   Rate limit: ${config.jobsPerMinute} jobs/min`);
  console.log(`   Demo mode: ${config.useDemo}`);

  // Check back-pressure
  const { apply: backPressure, queueDepth } = await shouldApplyBackPressure(config);
  console.log(`\nQueue status:`);
  console.log(`   Current depth: ${queueDepth}`);
  console.log(`   Back-pressure: ${backPressure ? 'YES ⚠️' : 'NO ✅'}`);

  const results: CrawlResult[] = [];
  let totalDiscovered = 0;
  let totalSubmitted = 0;
  let totalCacheHits = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // If back-pressure is applied, skip all crawls
  if (backPressure) {
    console.log('\n⚠️ Skipping all crawls due to back-pressure');
    for (const platformConfig of platformConfigs.filter((p) => p.enabled)) {
      results.push({
        platform: platformConfig.platform,
        success: true,
        postersDiscovered: 0,
        jobsSubmitted: 0,
        cacheHits: 0,
        errors: 0,
        skipped: true,
        skippedReason: 'Back-pressure applied',
        duration: 0,
      });
      totalSkipped++;
    }
  } else {
    // Crawl each enabled platform
    for (const platformConfig of platformConfigs) {
      if (!platformConfig.enabled) {
        continue;
      }

      const result = await crawlPlatform(platformConfig.platform, config, platformConfig, queueDepth);
      results.push(result);

      totalDiscovered += result.postersDiscovered;
      totalSubmitted += result.jobsSubmitted;
      totalCacheHits += result.cacheHits;
      totalErrors += result.errors;
      if (result.skipped) {
        totalSkipped++;
      }

      // Small delay between platforms
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCHEDULER SUMMARY');
  console.log('='.repeat(60));
  console.log(`   Platforms processed: ${results.length}`);
  console.log(`   Total discovered: ${totalDiscovered}`);
  console.log(`   Total submitted: ${totalSubmitted}`);
  console.log(`   Cache hits: ${totalCacheHits}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60) + '\n');

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    duration,
    queueDepthBefore: queueDepth,
    backPressureApplied: backPressure,
    platformsProcessed: results.length,
    totalDiscovered,
    totalSubmitted,
    totalCacheHits,
    totalErrors,
    totalSkipped,
    results,
  };
}

/**
 * Lambda handler for EventBridge scheduled events
 */
export async function handler(event: ScheduledEvent, context: Context): Promise<SchedulerSummary> {
  console.log('Scheduler triggered by EventBridge');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify({
    functionName: context.functionName,
    remainingTime: context.getRemainingTimeInMillis(),
  }, null, 2));

  return runScheduler();
}

/**
 * Get scheduler status handler for API Gateway
 */
export async function getStatusHandler(event: any): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const queueDepth = await getQueueDepth();
    const config = getSchedulerConfig();
    const platformConfigs = getPlatformConfigs();

    // Get last run for each platform
    const platformStatus: Record<string, any> = {};
    for (const pConfig of platformConfigs) {
      const lastRun = await getLastRunTime(pConfig.platform);
      platformStatus[pConfig.platform] = {
        enabled: pConfig.enabled,
        maxTitles: pConfig.maxTitles,
        lastRunAt: lastRun?.toISOString() || null,
      };
    }

    const status = {
      status: 'OK',
      queueDepth,
      backPressureActive: queueDepth >= config.maxQueueDepth,
      config: {
        maxQueueDepth: config.maxQueueDepth,
        maxJobsPerCycle: config.maxJobsPerCycle,
        jobsPerMinute: config.jobsPerMinute,
        minCrawlIntervalMinutes: config.minCrawlIntervalMinutes,
        useDemo: config.useDemo,
      },
      platforms: platformStatus,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(status, null, 2),
    };
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to get scheduler status',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

// Export for direct invocation and testing
export { runScheduler as run };
export { getSchedulerConfig, getPlatformConfigs };
