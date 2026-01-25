/**
 * SafeArt Backend Package
 * 
 * Exports job creation and processing functions
 */

// Job Creator exports
export { createJob, getJob, createJobHandler, getJobHandler } from './job-creator';

// Worker exports
export { handler as workerHandler } from './worker';

// Scheduler exports
export {
  handler as schedulerHandler,
  getStatusHandler as schedulerStatusHandler,
  runScheduler,
  SchedulerConfig,
  SchedulerSummary,
  CrawlResult,
} from './scheduler';

// Scheduler configuration exports
export {
  RateLimitConfig,
  BackPressureConfig,
  PlatformSchedule,
  ConcurrencyConfig,
  QueueConfig,
  AlarmConfig,
  FullSchedulerConfig,
  getFullConfig as getSchedulerFullConfig,
  CDK_CONFIG as SCHEDULER_CDK_CONFIG,
  DEFAULT_RATE_LIMIT,
  DEFAULT_BACK_PRESSURE,
  DEFAULT_CONCURRENCY,
  DEFAULT_QUEUE_CONFIG,
  DEFAULT_ALARM_CONFIG,
  PLATFORM_SCHEDULES,
} from './scheduler/config';

// Compliance engine exports
export {
  checkCompliance,
  createComplianceChecker,
  ComplianceChecker,
  ComplianceProvider,
  ComplianceEngineConfig,
  DEFAULT_POLICY,
  STRICT_POLICY,
  RekognitionComplianceChecker,
  MockComplianceChecker,
} from './compliance';

// Observability exports
export {
  // Logger
  Logger,
  LogLevel,
  LogEntry,
  createLogger,
  loggers,
  generateCorrelationId,
  // Metrics
  MetricName,
  MetricDataPoint,
  publishMetric,
  publishMetrics,
  EMFLogger,
  createEMFLogger,
  MetricsCollector,
  createMetricsCollector,
  // Tracing
  initializeTracing,
  getTraceContext,
  traceSegment,
  createTracer,
  Tracer,
} from './observability';

// Admin API exports
export {
  adminHandler,
  statsHandler,
  listJobsHandler,
  healthHandler,
  getSystemStats,
  listRecentJobs,
  healthCheck,
  SystemStats,
  JobSummary,
  HealthCheck,
} from './admin';
