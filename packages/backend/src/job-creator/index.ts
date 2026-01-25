import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CreateJobRequest,
  CreateJobResponse,
  Job,
  JobStatus,
  JobMessage,
} from '@safeart/shared';
import { hashBuffer, generateJobId } from '@safeart/shared';
import { validateCreateJobRequest } from '@safeart/shared';

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
const sqsClient = new SQSClient(awsConfig);

const TABLE_NAME = process.env.TABLE_NAME || '';
const S3_BUCKET = process.env.S3_BUCKET || '';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload image to S3
 */
async function uploadToS3(buffer: Buffer, key: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg', // Adjust based on actual image type
    })
  );
}

/**
 * Check for cached job by poster hash
 */
async function findCachedJob(posterHash: string): Promise<Job | null> {
  try {
    // Query by posterHash using GSI
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PosterHashIndex',
        KeyConditionExpression: 'posterHash = :hash',
        ExpressionAttributeValues: {
          ':hash': posterHash,
        },
        Limit: 1, // Only need one result
      })
    );
    return (result.Items?.[0] as Job) || null;
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

/**
 * Create a new job record in DynamoDB
 */
async function createJobRecord(job: Job): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: job,
    })
  );
}

/**
 * Send job message to SQS
 */
async function sendJobMessage(message: JobMessage): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
    })
  );
}

/**
 * Main job creation handler
 */
export async function createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
  // Validate request
  const validation = validateCreateJobRequest(request);
  if (!validation.valid) {
    throw new Error(`Invalid request: ${validation.errors.join(', ')}`);
  }

  // Download poster image
  console.log(`Downloading poster from ${request.posterUrl}`);
  const imageBuffer = await downloadImage(request.posterUrl);

  // Compute hash for cache lookup
  const posterHash = hashBuffer(imageBuffer);
  const jobId = generateJobId(request.platform, posterHash);

  // Check cache
  const cachedJob = await findCachedJob(posterHash);
  if (cachedJob && cachedJob.status === JobStatus.COMPLETED && cachedJob.result) {
    console.log(`Cache hit for poster hash: ${posterHash}`);
    return {
      jobId: cachedJob.jobId,
      status: JobStatus.CACHED,
      isCacheHit: true,
      cachedJobId: cachedJob.jobId,
      message: 'Job result retrieved from cache',
    };
  }

  // Check if job already exists (idempotency)
  if (request.requestId) {
    const existingJob = await findCachedJob(posterHash);
    if (existingJob && existingJob.requestId === request.requestId) {
      return {
        jobId: existingJob.jobId,
        status: existingJob.status,
        isCacheHit: false,
        message: 'Job already exists with same requestId',
      };
    }
  }

  // Upload to S3
  const s3Key = `posters/${request.platform.toLowerCase()}/${posterHash.substring(0, 2)}/${posterHash}.jpg`;
  console.log(`Uploading to S3: ${s3Key}`);
  await uploadToS3(imageBuffer, s3Key);

  // Create job record
  const now = new Date().toISOString();
  const job: Job = {
    jobId,
    requestId: request.requestId,
    posterHash,
    source: {
      platform: request.platform,
      url: request.posterUrl,
      pageUrl: request.pageUrl,
      discoveredAt: now,
    },
    metadata: request.metadata,
    status: JobStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    s3Bucket: S3_BUCKET,
    s3Key,
    cache: {
      posterHash,
      isCacheHit: false,
    },
  };

  await createJobRecord(job);

  // Send to SQS
  const jobMessage: JobMessage = {
    jobId,
    s3Bucket: S3_BUCKET,
    s3Key,
    posterHash,
  };
  await sendJobMessage(jobMessage);

  console.log(`Job created: ${jobId}`);

  return {
    jobId,
    status: JobStatus.PENDING,
    isCacheHit: false,
    message: 'Job created and queued for processing',
  };
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { jobId },
      })
    );
    return (result.Item as Job) || null;
  } catch (error) {
    console.error('Error getting job:', error);
    return null;
  }
}

/**
 * Lambda handler for API Gateway POST /jobs
 */
export async function createJobHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: CreateJobRequest = JSON.parse(event.body);
    const response = await createJob(request);

    return {
      statusCode: response.isCacheHit ? 200 : 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating job:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = errorMessage.includes('Invalid request') ? 400 : 500;

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}

/**
 * Lambda handler for API Gateway GET /jobs/{jobId}
 */
export async function getJobHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    const jobId = event.pathParameters?.jobId;
    
    if (!jobId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'jobId is required' }),
      };
    }

    const job = await getJob(jobId);
    
    if (!job) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    };
  } catch (error) {
    console.error('Error getting job:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
    };
  }
}
