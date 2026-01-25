/**
 * AWS X-Ray Tracing Utilities
 * 
 * Provides helpers for distributed tracing with AWS X-Ray.
 * Wraps AWS SDK calls and custom segments for end-to-end visibility.
 */

import * as AWSXRay from 'aws-xray-sdk-core';
import { Context } from 'aws-lambda';

// Check if X-Ray is enabled
const XRAY_ENABLED = process.env.AWS_XRAY_DAEMON_ADDRESS !== undefined || 
                     process.env._X_AMZN_TRACE_ID !== undefined;

/**
 * Segment annotation (indexed, searchable)
 */
export interface SegmentAnnotation {
  key: string;
  value: string | number | boolean;
}

/**
 * Segment metadata (not indexed)
 */
export interface SegmentMetadata {
  [key: string]: unknown;
}

/**
 * Tracing context
 */
export interface TracingContext {
  traceId?: string;
  segmentId?: string;
  sampled?: boolean;
}

/**
 * Initialize X-Ray tracing
 * Call this at Lambda cold start
 */
export function initializeTracing(): void {
  if (!XRAY_ENABLED) {
    console.log('X-Ray tracing not enabled (no daemon address or trace ID)');
    return;
  }

  try {
    // Configure X-Ray
    AWSXRay.setContextMissingStrategy('LOG_ERROR');
    
    // Capture all AWS SDK calls
    AWSXRay.captureAWS(require('aws-sdk'));
    
    console.log('X-Ray tracing initialized');
  } catch (error) {
    console.warn('Failed to initialize X-Ray:', error);
  }
}

/**
 * Get current trace context
 */
export function getTraceContext(): TracingContext {
  const traceHeader = process.env._X_AMZN_TRACE_ID;
  if (!traceHeader) {
    return {};
  }

  const context: TracingContext = {};
  
  const rootMatch = traceHeader.match(/Root=([^;]+)/);
  if (rootMatch) {
    context.traceId = rootMatch[1];
  }

  const parentMatch = traceHeader.match(/Parent=([^;]+)/);
  if (parentMatch) {
    context.segmentId = parentMatch[1];
  }

  const sampledMatch = traceHeader.match(/Sampled=([^;]+)/);
  if (sampledMatch) {
    context.sampled = sampledMatch[1] === '1';
  }

  return context;
}

/**
 * Create a subsegment for tracing a specific operation
 */
export async function traceSegment<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    annotations?: SegmentAnnotation[];
    metadata?: SegmentMetadata;
  }
): Promise<T> {
  if (!XRAY_ENABLED) {
    return fn();
  }

  const segment = AWSXRay.getSegment();
  if (!segment) {
    return fn();
  }

  const subsegment = segment.addNewSubsegment(name);

  try {
    // Add annotations (indexed)
    if (options?.annotations) {
      for (const { key, value } of options.annotations) {
        subsegment.addAnnotation(key, value);
      }
    }

    // Add metadata (not indexed)
    if (options?.metadata) {
      subsegment.addMetadata('data', options.metadata);
    }

    const result = await fn();
    subsegment.close();
    return result;
  } catch (error) {
    subsegment.addError(error as Error);
    subsegment.close();
    throw error;
  }
}

/**
 * Trace a synchronous operation
 */
export function traceSync<T>(
  name: string,
  fn: () => T,
  options?: {
    annotations?: SegmentAnnotation[];
    metadata?: SegmentMetadata;
  }
): T {
  if (!XRAY_ENABLED) {
    return fn();
  }

  const segment = AWSXRay.getSegment();
  if (!segment) {
    return fn();
  }

  const subsegment = segment.addNewSubsegment(name);

  try {
    if (options?.annotations) {
      for (const { key, value } of options.annotations) {
        subsegment.addAnnotation(key, value);
      }
    }

    if (options?.metadata) {
      subsegment.addMetadata('data', options.metadata);
    }

    const result = fn();
    subsegment.close();
    return result;
  } catch (error) {
    subsegment.addError(error as Error);
    subsegment.close();
    throw error;
  }
}

/**
 * Add annotation to current segment
 */
export function addAnnotation(key: string, value: string | number | boolean): void {
  if (!XRAY_ENABLED) return;

  try {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addAnnotation(key, value);
    }
  } catch (error) {
    // Ignore errors - tracing should not break the app
  }
}

/**
 * Add metadata to current segment
 */
export function addMetadata(key: string, value: unknown, namespace?: string): void {
  if (!XRAY_ENABLED) return;

  try {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addMetadata(key, value, namespace);
    }
  } catch (error) {
    // Ignore errors - tracing should not break the app
  }
}

/**
 * Add error to current segment
 */
export function addError(error: Error): void {
  if (!XRAY_ENABLED) return;

  try {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addError(error);
    }
  } catch (err) {
    // Ignore errors - tracing should not break the app
  }
}

/**
 * Wrap a Lambda handler with X-Ray tracing
 */
export function wrapHandler<TEvent, TResult>(
  handler: (event: TEvent, context: Context) => Promise<TResult>,
  options?: {
    name?: string;
    captureResponse?: boolean;
  }
): (event: TEvent, context: Context) => Promise<TResult> {
  return async (event: TEvent, context: Context): Promise<TResult> => {
    if (!XRAY_ENABLED) {
      return handler(event, context);
    }

    const handlerName = options?.name || context.functionName || 'handler';

    return traceSegment(
      handlerName,
      () => handler(event, context),
      {
        annotations: [
          { key: 'functionName', value: context.functionName },
          { key: 'requestId', value: context.awsRequestId },
        ],
        metadata: options?.captureResponse ? { event } : undefined,
      }
    );
  };
}

/**
 * Create a traced version of an AWS SDK client
 * Note: For AWS SDK v3, use middleware instead
 */
export function captureAWSClient<T>(client: T): T {
  if (!XRAY_ENABLED) {
    return client;
  }

  try {
    return AWSXRay.captureAWSClient(client as any) as T;
  } catch (error) {
    console.warn('Failed to capture AWS client for X-Ray:', error);
    return client;
  }
}

/**
 * Tracer class for managing traces in a request
 */
export class Tracer {
  private component: string;
  private enabled: boolean;

  constructor(component: string) {
    this.component = component;
    this.enabled = XRAY_ENABLED;
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get trace context
   */
  getContext(): TracingContext {
    return getTraceContext();
  }

  /**
   * Trace an async operation
   */
  async trace<T>(
    operation: string,
    fn: () => Promise<T>,
    annotations?: Record<string, string | number | boolean>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const segmentAnnotations = annotations
      ? Object.entries(annotations).map(([key, value]) => ({ key, value }))
      : undefined;

    return traceSegment(
      `${this.component}.${operation}`,
      fn,
      { annotations: segmentAnnotations, metadata }
    );
  }

  /**
   * Trace a sync operation
   */
  traceSync<T>(
    operation: string,
    fn: () => T,
    annotations?: Record<string, string | number | boolean>
  ): T {
    const segmentAnnotations = annotations
      ? Object.entries(annotations).map(([key, value]) => ({ key, value }))
      : undefined;

    return traceSync(`${this.component}.${operation}`, fn, { annotations: segmentAnnotations });
  }

  /**
   * Add an annotation
   */
  annotate(key: string, value: string | number | boolean): void {
    addAnnotation(`${this.component}.${key}`, value);
  }

  /**
   * Add metadata
   */
  metadata(key: string, value: unknown): void {
    addMetadata(key, value, this.component);
  }

  /**
   * Record an error
   */
  error(error: Error): void {
    addError(error);
  }
}

/**
 * Create a tracer for a component
 */
export function createTracer(component: string): Tracer {
  return new Tracer(component);
}
