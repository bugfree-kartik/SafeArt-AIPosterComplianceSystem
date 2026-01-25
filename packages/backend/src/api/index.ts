import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createJob } from '../job-creator';
import { CreateJobRequest } from '@safeart/shared';

/**
 * API handler for creating jobs
 * Optional internal API for debugging/inspection
 */
export async function createJobHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: CreateJobRequest = JSON.parse(event.body);
    const response = await createJob(request);

    return {
      statusCode: 201,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating job:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: (error as Error).message,
      }),
    };
  }
}

/**
 * API handler for getting job status
 */
export async function getJobHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'jobId is required' }),
      };
    }

    // TODO: Implement job retrieval from DynamoDB
    return {
      statusCode: 501,
      body: JSON.stringify({ error: 'Not implemented yet' }),
    };
  } catch (error) {
    console.error('Error getting job:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: (error as Error).message,
      }),
    };
  }
}

