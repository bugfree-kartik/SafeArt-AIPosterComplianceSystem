/**
 * Observability Module
 * 
 * Exports logging, metrics, and tracing utilities for the SafeArt system.
 */

// Logger exports
export {
  Logger,
  LogLevel,
  LogEntry,
  LoggerContext,
  LoggerConfig,
  createLogger,
  loggers,
  generateCorrelationId,
} from './logger';

// Metrics exports
export {
  MetricName,
  MetricNameType,
  DimensionName,
  MetricDimension,
  MetricDataPoint,
  publishMetric,
  publishMetrics,
  EMFLogger,
  createEMFLogger,
  MetricsCollector,
  createMetricsCollector,
} from './metrics';

// Tracing exports
export {
  TracingContext,
  SegmentAnnotation,
  SegmentMetadata,
  initializeTracing,
  getTraceContext,
  traceSegment,
  traceSync,
  addAnnotation,
  addMetadata,
  addError,
  wrapHandler,
  captureAWSClient,
  Tracer,
  createTracer,
} from './tracing';

// Re-export StandardUnit for convenience
export { StandardUnit } from '@aws-sdk/client-cloudwatch';
