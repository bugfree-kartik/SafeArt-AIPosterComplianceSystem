import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { Job, JobStatus, JobMessage } from '@safeart/shared';

// Configure AWS clients to use LocalStack endpoint if provided
const awsConfig: {
  endpoint?: string;
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  forcePathStyle?: boolean;
} = {};

if (process.env.AWS_ENDPOINT_URL) {
  awsConfig.endpoint = process.env.AWS_ENDPOINT_URL;
  awsConfig.region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
  awsConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  };
  // LocalStack requires path-style addressing for S3
  awsConfig.forcePathStyle = true;
}

const s3Client = new S3Client(awsConfig);
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.TABLE_NAME || '';
const S3_BUCKET = process.env.S3_BUCKET || '';

/**
 * Read job record from DynamoDB
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
 * Update job status in DynamoDB
 */
async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates: Partial<Job>
): Promise<void> {
  const now = new Date().toISOString();
  const updateExpression: string[] = ['SET #status = :status', '#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': now,
  };

  if (updates.startedAt) {
    updateExpression.push('#startedAt = :startedAt');
    expressionAttributeNames['#startedAt'] = 'startedAt';
    expressionAttributeValues[':startedAt'] = updates.startedAt;
  }

  if (updates.completedAt) {
    updateExpression.push('#completedAt = :completedAt');
    expressionAttributeNames['#completedAt'] = 'completedAt';
    expressionAttributeValues[':completedAt'] = updates.completedAt;
  }

  if (updates.result) {
    updateExpression.push('#result = :result');
    expressionAttributeNames['#result'] = 'result';
    expressionAttributeValues[':result'] = updates.result;
  }

  if (updates.error) {
    updateExpression.push('#error = :error');
    expressionAttributeNames['#error'] = 'error';
    expressionAttributeValues[':error'] = updates.error;
  }

  if (updates.processingDurationMs !== undefined) {
    updateExpression.push('#processingDurationMs = :processingDurationMs');
    expressionAttributeNames['#processingDurationMs'] = 'processingDurationMs';
    expressionAttributeValues[':processingDurationMs'] = updates.processingDurationMs;
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { jobId },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

/**
 * Download image from S3
 */
async function downloadFromS3(bucket: string, key: string): Promise<Buffer> {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!result.Body) {
    throw new Error('Empty response body from S3');
  }

  const chunks: Uint8Array[] = [];
  // @ts-ignore - Body is a stream
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Placeholder compliance check
 * TODO: Replace with actual model integration in Phase 5
 */
async function checkCompliance(imageBuffer: Buffer): Promise<Job['result']> {
  // Placeholder implementation
  // In Phase 5, this will call actual vision models
  
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    isCompliant: true,
    violations: [],
    processedAt: new Date().toISOString(),
    modelVersion: 'placeholder-v1',
  };
}

/**
 * Process a single job
 */
async function processJob(message: JobMessage): Promise<void> {
  const startTime = Date.now();
  const { jobId, s3Bucket, s3Key, posterHash } = message;

  console.log(`Processing job: ${jobId}`);

  try {
    // Get job record
    const job = await getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Update status to PROCESSING
    await updateJobStatus(jobId, JobStatus.PROCESSING, {
      startedAt: new Date().toISOString(),
    });

    // Download image from S3
    console.log(`Downloading image from S3: ${s3Key}`);
    const imageBuffer = await downloadFromS3(s3Bucket, s3Key);

    // Run compliance check
    console.log(`Running compliance check for job: ${jobId}`);
    const result = await checkCompliance(imageBuffer);

    // Update job with result
    const processingDuration = Date.now() - startTime;
    await updateJobStatus(jobId, JobStatus.COMPLETED, {
      completedAt: new Date().toISOString(),
      result,
      processingDurationMs: processingDuration,
    });

    console.log(`Job completed: ${jobId} (${processingDuration}ms)`);
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    
    const errorInfo = {
      code: (error as Error).name || 'UNKNOWN_ERROR',
      message: (error as Error).message || 'Unknown error',
      stack: (error as Error).stack,
    };

    await updateJobStatus(jobId, JobStatus.FAILED, {
      error: errorInfo,
    });

    throw error; // Re-throw to trigger DLQ
  }
}

/**
 * Lambda handler for SQS events
 */
export async function handler(event: SQSEvent): Promise<void> {
  console.log(`Received ${event.Records.length} SQS records`);

  for (const record of event.Records) {
    try {
      const message: JobMessage = JSON.parse(record.body);
      await processJob(message);
    } catch (error) {
      console.error('Error processing SQS record:', error);
      // Error will be sent to DLQ by SQS
      throw error;
    }
  }
}

