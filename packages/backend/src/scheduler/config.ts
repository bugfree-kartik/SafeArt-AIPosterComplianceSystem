/**
 * Scheduler Configuration
 * 
 * Configures rate limiting, back-pressure, and platform-specific schedules.
 */

import { Platform } from '@safeart/shared';

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  // Jobs per time window
  requestsPerWindow: number;
  // Window duration in seconds
  windowDurationSeconds: number;
  // Burst limit (max jobs in a burst)
  burstLimit: number;
  // Cool-down period after burst (seconds)
  cooldownSeconds: number;
}

/**
 * Default rate limit: 30 jobs per minute with burst of 50
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerWindow: 30,
  windowDurationSeconds: 60,
  burstLimit: 50,
  cooldownSeconds: 30,
};

/**
 * Back-pressure configuration
 */
export interface BackPressureConfig {
  // Start throttling at this queue depth
  softLimit: number;
  // Stop accepting jobs at this queue depth
  hardLimit: number;
  // Throttle factor (0-1, multiply jobs by this factor)
  throttleFactor: number;
  // Check interval (seconds)
  checkIntervalSeconds: number;
}

/**
 * Default back-pressure configuration
 */
export const DEFAULT_BACK_PRESSURE: BackPressureConfig = {
  softLimit: 50,
  hardLimit: 100,
  throttleFactor: 0.5,
  checkIntervalSeconds: 10,
};

/**
 * Platform schedule configuration
 */
export interface PlatformSchedule {
  platform: Platform;
  // Whether scheduling is enabled
  enabled: boolean;
  // Cron expression or rate expression for EventBridge
  scheduleExpression: string;
  // Maximum titles to fetch per run
  maxTitlesPerRun: number;
  // Platform-specific rate limit override
  rateLimit?: Partial<RateLimitConfig>;
  // Priority (lower = higher priority)
  priority: number;
  // Description
  description: string;
}

/**
 * Default platform schedules
 */
export const PLATFORM_SCHEDULES: PlatformSchedule[] = [
  {
    platform: Platform.NETFLIX,
    enabled: true,
    scheduleExpression: 'rate(6 hours)',
    maxTitlesPerRun: 50,
    priority: 1,
    description: 'Netflix poster crawling every 6 hours',
  },
  {
    platform: Platform.PRIME_VIDEO,
    enabled: false,
    scheduleExpression: 'rate(6 hours)',
    maxTitlesPerRun: 50,
    priority: 2,
    description: 'Prime Video poster crawling every 6 hours',
  },
  {
    platform: Platform.DISNEY_PLUS,
    enabled: false,
    scheduleExpression: 'rate(12 hours)',
    maxTitlesPerRun: 30,
    priority: 3,
    description: 'Disney+ poster crawling every 12 hours',
  },
  {
    platform: Platform.HULU,
    enabled: false,
    scheduleExpression: 'rate(12 hours)',
    maxTitlesPerRun: 30,
    priority: 4,
    description: 'Hulu poster crawling every 12 hours',
  },
  {
    platform: Platform.HBO_MAX,
    enabled: false,
    scheduleExpression: 'rate(12 hours)',
    maxTitlesPerRun: 30,
    priority: 5,
    description: 'HBO Max poster crawling every 12 hours',
  },
  {
    platform: Platform.APPLE_TV,
    enabled: false,
    scheduleExpression: 'rate(12 hours)',
    maxTitlesPerRun: 30,
    priority: 6,
    description: 'Apple TV poster crawling every 12 hours',
  },
];

/**
 * Lambda concurrency configuration
 */
export interface ConcurrencyConfig {
  // Worker Lambda concurrent executions
  workerConcurrency: number;
  // Job Creator Lambda concurrent executions
  jobCreatorConcurrency: number;
  // Scheduler Lambda concurrent executions (should be 1)
  schedulerConcurrency: number;
  // SQS batch size for worker
  sqsBatchSize: number;
  // SQS batching window (seconds)
  sqsBatchingWindow: number;
}

/**
 * Default concurrency configuration
 */
export const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  workerConcurrency: 10,
  jobCreatorConcurrency: 20,
  schedulerConcurrency: 1, // Only one scheduler at a time
  sqsBatchSize: 1, // Process one job at a time
  sqsBatchingWindow: 5,
};

/**
 * SQS queue configuration
 */
export interface QueueConfig {
  // Visibility timeout (seconds)
  visibilityTimeoutSeconds: number;
  // Message retention period (days)
  retentionPeriodDays: number;
  // Long polling wait time (seconds)
  receiveWaitTimeSeconds: number;
  // Max receive count before DLQ
  maxReceiveCount: number;
  // DLQ retention period (days)
  dlqRetentionPeriodDays: number;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  visibilityTimeoutSeconds: 300, // 5 minutes
  retentionPeriodDays: 4,
  receiveWaitTimeSeconds: 20, // Long polling
  maxReceiveCount: 3,
  dlqRetentionPeriodDays: 14,
};

/**
 * CloudWatch alarm configuration
 */
export interface AlarmConfig {
  // Queue depth alarm threshold
  queueDepthThreshold: number;
  // DLQ message count threshold
  dlqMessageThreshold: number;
  // Error rate threshold (percentage)
  errorRateThreshold: number;
  // Evaluation periods for alarms
  evaluationPeriods: number;
  // Period duration (seconds)
  periodSeconds: number;
}

/**
 * Default alarm configuration
 */
export const DEFAULT_ALARM_CONFIG: AlarmConfig = {
  queueDepthThreshold: 100,
  dlqMessageThreshold: 5,
  errorRateThreshold: 10, // 10%
  evaluationPeriods: 3,
  periodSeconds: 60,
};

/**
 * Complete scheduler configuration
 */
export interface FullSchedulerConfig {
  rateLimit: RateLimitConfig;
  backPressure: BackPressureConfig;
  platforms: PlatformSchedule[];
  concurrency: ConcurrencyConfig;
  queue: QueueConfig;
  alarms: AlarmConfig;
}

/**
 * Get full scheduler configuration with defaults
 */
export function getFullConfig(overrides: Partial<FullSchedulerConfig> = {}): FullSchedulerConfig {
  return {
    rateLimit: { ...DEFAULT_RATE_LIMIT, ...overrides.rateLimit },
    backPressure: { ...DEFAULT_BACK_PRESSURE, ...overrides.backPressure },
    platforms: overrides.platforms || PLATFORM_SCHEDULES,
    concurrency: { ...DEFAULT_CONCURRENCY, ...overrides.concurrency },
    queue: { ...DEFAULT_QUEUE_CONFIG, ...overrides.queue },
    alarms: { ...DEFAULT_ALARM_CONFIG, ...overrides.alarms },
  };
}

/**
 * Export configuration for CDK stack
 */
export const CDK_CONFIG = getFullConfig();
