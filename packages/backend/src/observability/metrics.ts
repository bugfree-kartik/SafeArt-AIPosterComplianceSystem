/**
 * Custom CloudWatch Metrics
 * 
 * Provides helpers for publishing custom metrics to CloudWatch.
 * Uses embedded metric format (EMF) for efficient metric publishing.
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

// Configure AWS client
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

const cloudWatchClient = new CloudWatchClient(awsConfig);

/**
 * Metric namespace
 */
const NAMESPACE = 'SafeArt';

/**
 * Metric names
 */
export const MetricName = {
  // Job metrics
  JOBS_CREATED: 'JobsCreated',
  JOBS_COMPLETED: 'JobsCompleted',
  JOBS_FAILED: 'JobsFailed',
  JOBS_CACHED: 'JobsCached',
  
  // Processing metrics
  PROCESSING_DURATION: 'ProcessingDuration',
  IMAGE_DOWNLOAD_DURATION: 'ImageDownloadDuration',
  COMPLIANCE_CHECK_DURATION: 'ComplianceCheckDuration',
  
  // Compliance metrics
  COMPLIANCE_PASSED: 'CompliancePassed',
  COMPLIANCE_FAILED: 'ComplianceFailed',
  VIOLATIONS_DETECTED: 'ViolationsDetected',
  
  // Crawler metrics
  POSTERS_DISCOVERED: 'PostersDiscovered',
  CRAWL_DURATION: 'CrawlDuration',
  CRAWL_ERRORS: 'CrawlErrors',
  
  // Scheduler metrics
  SCHEDULER_RUNS: 'SchedulerRuns',
  BACKPRESSURE_EVENTS: 'BackpressureEvents',
  
  // Cache metrics
  CACHE_HITS: 'CacheHits',
  CACHE_MISSES: 'CacheMisses',
  
  // Error metrics
  ERRORS: 'Errors',
  RETRIES: 'Retries',
} as const;

export type MetricNameType = typeof MetricName[keyof typeof MetricName];

/**
 * Dimension names
 */
export const DimensionName = {
  PLATFORM: 'Platform',
  STATUS: 'Status',
  VIOLATION_TYPE: 'ViolationType',
  ERROR_TYPE: 'ErrorType',
  COMPONENT: 'Component',
} as const;

/**
 * Metric dimension
 */
export interface MetricDimension {
  Name: string;
  Value: string;
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: MetricNameType;
  value: number;
  unit?: StandardUnit;
  dimensions?: MetricDimension[];
  timestamp?: Date;
}

/**
 * Publish a single metric to CloudWatch
 */
export async function publishMetric(metric: MetricDataPoint): Promise<void> {
  if (process.env.DISABLE_METRICS === 'true') {
    return;
  }

  try {
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metric.name,
            Value: metric.value,
            Unit: metric.unit || StandardUnit.Count,
            Dimensions: metric.dimensions,
            Timestamp: metric.timestamp || new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Error publishing metric:', error);
  }
}

/**
 * Publish multiple metrics to CloudWatch
 */
export async function publishMetrics(metrics: MetricDataPoint[]): Promise<void> {
  if (process.env.DISABLE_METRICS === 'true' || metrics.length === 0) {
    return;
  }

  // CloudWatch allows max 1000 metrics per request, batch if needed
  const batchSize = 20; // Keep batches small for Lambda
  const batches: MetricDataPoint[][] = [];
  
  for (let i = 0; i < metrics.length; i += batchSize) {
    batches.push(metrics.slice(i, i + batchSize));
  }

  try {
    await Promise.all(
      batches.map((batch) =>
        cloudWatchClient.send(
          new PutMetricDataCommand({
            Namespace: NAMESPACE,
            MetricData: batch.map((m) => ({
              MetricName: m.name,
              Value: m.value,
              Unit: m.unit || StandardUnit.Count,
              Dimensions: m.dimensions,
              Timestamp: m.timestamp || new Date(),
            })),
          })
        )
      )
    );
  } catch (error) {
    console.error('Error publishing metrics:', error);
  }
}

/**
 * Embedded Metric Format (EMF) logger
 * Outputs metrics in EMF format for automatic CloudWatch ingestion
 */
export class EMFLogger {
  private namespace: string;
  private dimensions: Record<string, string>;
  private metrics: Record<string, { value: number; unit: string }>;
  private properties: Record<string, unknown>;

  constructor(namespace: string = NAMESPACE) {
    this.namespace = namespace;
    this.dimensions = {};
    this.metrics = {};
    this.properties = {};
  }

  /**
   * Set a dimension
   */
  setDimension(name: string, value: string): this {
    this.dimensions[name] = value;
    return this;
  }

  /**
   * Set multiple dimensions
   */
  setDimensions(dimensions: Record<string, string>): this {
    Object.assign(this.dimensions, dimensions);
    return this;
  }

  /**
   * Add a metric
   */
  putMetric(name: string, value: number, unit: string = 'Count'): this {
    this.metrics[name] = { value, unit };
    return this;
  }

  /**
   * Add a property (searchable in logs but not a metric)
   */
  setProperty(name: string, value: unknown): this {
    this.properties[name] = value;
    return this;
  }

  /**
   * Flush metrics as EMF JSON to stdout
   */
  flush(): void {
    if (Object.keys(this.metrics).length === 0) {
      return;
    }

    const dimensionNames = Object.keys(this.dimensions);
    const metricDefinitions = Object.entries(this.metrics).map(([name, { unit }]) => ({
      Name: name,
      Unit: unit,
    }));

    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: this.namespace,
            Dimensions: [dimensionNames],
            Metrics: metricDefinitions,
          },
        ],
      },
      ...this.dimensions,
      ...Object.fromEntries(
        Object.entries(this.metrics).map(([name, { value }]) => [name, value])
      ),
      ...this.properties,
    };

    console.log(JSON.stringify(emf));

    // Reset for next use
    this.metrics = {};
    this.properties = {};
  }
}

/**
 * Create an EMF logger with default SafeArt namespace
 */
export function createEMFLogger(): EMFLogger {
  return new EMFLogger(NAMESPACE);
}

/**
 * Metrics collector for aggregating metrics during a request
 */
export class MetricsCollector {
  private metrics: MetricDataPoint[] = [];
  private component: string;
  private baseDimensions: MetricDimension[];

  constructor(component: string, baseDimensions?: MetricDimension[]) {
    this.component = component;
    this.baseDimensions = baseDimensions || [
      { Name: DimensionName.COMPONENT, Value: component },
    ];
  }

  /**
   * Record a count metric
   */
  count(name: MetricNameType, value: number = 1, dimensions?: MetricDimension[]): void {
    this.metrics.push({
      name,
      value,
      unit: StandardUnit.Count,
      dimensions: [...this.baseDimensions, ...(dimensions || [])],
    });
  }

  /**
   * Record a duration metric in milliseconds
   */
  duration(name: MetricNameType, milliseconds: number, dimensions?: MetricDimension[]): void {
    this.metrics.push({
      name,
      value: milliseconds,
      unit: StandardUnit.Milliseconds,
      dimensions: [...this.baseDimensions, ...(dimensions || [])],
    });
  }

  /**
   * Time an async operation
   */
  async time<T>(
    name: MetricNameType,
    fn: () => Promise<T>,
    dimensions?: MetricDimension[]
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.duration(name, Date.now() - start, dimensions);
      return result;
    } catch (error) {
      this.duration(name, Date.now() - start, dimensions);
      throw error;
    }
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): MetricDataPoint[] {
    return [...this.metrics];
  }

  /**
   * Flush all collected metrics to CloudWatch
   */
  async flush(): Promise<void> {
    if (this.metrics.length > 0) {
      await publishMetrics(this.metrics);
      this.metrics = [];
    }
  }

  /**
   * Flush using EMF format (more efficient)
   */
  flushEMF(): void {
    if (this.metrics.length === 0) {
      return;
    }

    const emf = createEMFLogger();
    
    // Set base dimensions
    for (const dim of this.baseDimensions) {
      emf.setDimension(dim.Name, dim.Value);
    }

    // Add all metrics
    for (const metric of this.metrics) {
      const unit = metric.unit === StandardUnit.Milliseconds ? 'Milliseconds' : 'Count';
      emf.putMetric(metric.name, metric.value, unit);
    }

    emf.flush();
    this.metrics = [];
  }
}

/**
 * Create a metrics collector for a component
 */
export function createMetricsCollector(component: string): MetricsCollector {
  return new MetricsCollector(component);
}
