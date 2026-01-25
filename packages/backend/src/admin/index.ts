/**
 * Admin/Inspection API
 * 
 * Provides endpoints for system inspection, statistics, and health checks.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Job, JobStatus, Platform } from '@safeart/shared';
import { createLogger, generateCorrelationId } from '../observability/logger';

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

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig), {
  marshallOptions: { removeUndefinedValues: true },
});
const sqsClient = new SQSClient(awsConfig);

const logger = createLogger('admin-api');

const TABLE_NAME = process.env.TABLE_NAME || '';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const DLQ_URL = process.env.DLQ_URL || '';

/**
 * Standard API response headers
 */
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * System statistics
 */
export interface SystemStats {
  jobs: {
    total: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
    last24Hours: number;
    lastHour: number;
  };
  queue: {
    depth: number;
    dlqDepth: number;
    inFlight: number;
  };
  compliance: {
    passed: number;
    failed: number;
    passRate: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  timestamp: string;
}

/**
 * Job summary for listing
 */
export interface JobSummary {
  jobId: string;
  platform: Platform;
  title: string;
  status: JobStatus;
  isCompliant?: boolean;
  createdAt: string;
  completedAt?: string;
  processingDurationMs?: number;
}

/**
 * Get queue attributes
 */
async function getQueueDepth(queueUrl: string): Promise<{ visible: number; inFlight: number }> {
  if (!queueUrl) {
    return { visible: 0, inFlight: 0 };
  }

  try {
    const response = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      })
    );

    return {
      visible: parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10),
      inFlight: parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10),
    };
  } catch (error) {
    logger.error('Error getting queue depth', error as Error);
    return { visible: 0, inFlight: 0 };
  }
}

/**
 * Get job counts by status
 */
async function getJobCountsByStatus(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    [JobStatus.PENDING]: 0,
    [JobStatus.PROCESSING]: 0,
    [JobStatus.COMPLETED]: 0,
    [JobStatus.FAILED]: 0,
    [JobStatus.CACHED]: 0,
  };

  for (const status of Object.values(JobStatus)) {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          Select: 'COUNT',
        })
      );
      counts[status] = response.Count || 0;
    } catch (error) {
      logger.error(`Error counting jobs with status ${status}`, error as Error);
    }
  }

  return counts;
}

/**
 * Get jobs created in time range
 */
async function getJobsInTimeRange(status: JobStatus, since: Date): Promise<number> {
  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status AND createdAt >= :since',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':since': since.toISOString(),
        },
        Select: 'COUNT',
      })
    );
    return response.Count || 0;
  } catch (error) {
    logger.error('Error getting jobs in time range', error as Error);
    return 0;
  }
}

/**
 * Get system statistics
 */
export async function getSystemStats(): Promise<SystemStats> {
  const correlationId = generateCorrelationId();
  logger.setCorrelationId(correlationId);
  logger.info('Getting system statistics');

  const [statusCounts, queueDepth, dlqDepth] = await Promise.all([
    getJobCountsByStatus(),
    getQueueDepth(SQS_QUEUE_URL),
    getQueueDepth(DLQ_URL),
  ]);

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const lastHourJobs = await getJobsInTimeRange(JobStatus.COMPLETED, oneHourAgo);
  const last24HoursJobs = await getJobsInTimeRange(JobStatus.COMPLETED, oneDayAgo);

  const totalJobs = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const completedJobs = statusCounts[JobStatus.COMPLETED] || 0;
  const cachedJobs = statusCounts[JobStatus.CACHED] || 0;

  const passedJobs = completedJobs;
  const failedJobs = statusCounts[JobStatus.FAILED] || 0;
  const passRate = completedJobs > 0 ? (passedJobs / completedJobs) * 100 : 0;

  const cacheHits = cachedJobs;
  const cacheMisses = completedJobs;
  const cacheHitRate = (cacheHits + cacheMisses) > 0 
    ? (cacheHits / (cacheHits + cacheMisses)) * 100 
    : 0;

  return {
    jobs: {
      total: totalJobs,
      byStatus: statusCounts,
      byPlatform: {},
      last24Hours: last24HoursJobs,
      lastHour: lastHourJobs,
    },
    queue: {
      depth: queueDepth.visible,
      dlqDepth: dlqDepth.visible,
      inFlight: queueDepth.inFlight,
    },
    compliance: {
      passed: passedJobs,
      failed: failedJobs,
      passRate: Math.round(passRate * 100) / 100,
    },
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: Math.round(cacheHitRate * 100) / 100,
    },
    timestamp: now.toISOString(),
  };
}

/**
 * List recent jobs
 */
export async function listRecentJobs(
  status?: JobStatus,
  limit: number = 20
): Promise<JobSummary[]> {
  const correlationId = generateCorrelationId();
  logger.setCorrelationId(correlationId);
  logger.info('Listing recent jobs', { status, limit });

  try {
    let items: Job[];

    if (status) {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          ScanIndexForward: false,
          Limit: limit,
        })
      );
      items = (response.Items || []) as Job[];
    } else {
      const response = await dynamoClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          Limit: limit * 2,
        })
      );
      items = ((response.Items || []) as Job[])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }

    return items.map((job) => ({
      jobId: job.jobId,
      platform: job.source.platform,
      title: job.metadata.title,
      status: job.status,
      isCompliant: job.result?.isCompliant,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      processingDurationMs: job.processingDurationMs,
    }));
  } catch (error) {
    logger.error('Error listing jobs', error as Error);
    return [];
  }
}

/**
 * Health check response
 */
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    dynamodb: { status: string; latencyMs?: number };
    sqs: { status: string; queueDepth?: number };
    dlq: { status: string; messageCount?: number };
  };
  timestamp: string;
}

/**
 * Perform health check
 */
export async function healthCheck(): Promise<HealthCheck> {
  const components: HealthCheck['components'] = {
    dynamodb: { status: 'unknown' },
    sqs: { status: 'unknown' },
    dlq: { status: 'unknown' },
  };

  try {
    const dbStart = Date.now();
    await dynamoClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 1,
      })
    );
    components.dynamodb = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
    };
  } catch {
    components.dynamodb = { status: 'unhealthy' };
  }

  try {
    const queueDepth = await getQueueDepth(SQS_QUEUE_URL);
    components.sqs = {
      status: 'healthy',
      queueDepth: queueDepth.visible + queueDepth.inFlight,
    };
  } catch {
    components.sqs = { status: 'unhealthy' };
  }

  try {
    const dlqDepth = await getQueueDepth(DLQ_URL);
    components.dlq = {
      status: dlqDepth.visible > 10 ? 'degraded' : 'healthy',
      messageCount: dlqDepth.visible,
    };
  } catch {
    components.dlq = { status: 'unhealthy' };
  }

  const statuses = Object.values(components).map((c) => c.status);
  let overallStatus: HealthCheck['status'] = 'healthy';
  
  if (statuses.includes('unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    components,
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /admin/stats - System statistics
 */
export async function statsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const stats = await getSystemStats();
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify(stats, null, 2),
    };
  } catch (error) {
    logger.error('Error getting stats', error as Error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Failed to get statistics' }),
    };
  }
}

/**
 * GET /admin/jobs - List recent jobs
 */
export async function listJobsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const status = event.queryStringParameters?.status as JobStatus | undefined;
    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    const jobs = await listRecentJobs(status, Math.min(limit, 100));
    
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        jobs,
        count: jobs.length,
        filters: { status, limit },
      }, null, 2),
    };
  } catch (error) {
    logger.error('Error listing jobs', error as Error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Failed to list jobs' }),
    };
  }
}

/**
 * GET /admin/health - Health check
 */
export async function healthHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const health = await healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    return {
      statusCode,
      headers: HEADERS,
      body: JSON.stringify(health, null, 2),
    };
  } catch (error) {
    logger.error('Error performing health check', error as Error);
    return {
      statusCode: 503,
      headers: HEADERS,
      body: JSON.stringify({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Main admin API router
 */
export async function adminHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const path = event.path || event.resource || '';
  const method = event.httpMethod || 'GET';

  logger.info('Admin API request', { path, method });

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: '',
    };
  }

  if (path.endsWith('/stats')) {
    return statsHandler(event);
  }
  
  if (path.endsWith('/jobs')) {
    return listJobsHandler(event);
  }
  
  if (path.endsWith('/health')) {
    return healthHandler(event);
  }

  return {
    statusCode: 404,
    headers: HEADERS,
    body: JSON.stringify({
      error: 'Not found',
      availableEndpoints: [
        'GET /admin/stats',
        'GET /admin/jobs',
        'GET /admin/health',
      ],
    }),
  };
}
