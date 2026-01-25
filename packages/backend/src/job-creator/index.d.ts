import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CreateJobRequest, CreateJobResponse, Job } from '@safeart/shared';
/**
 * Main job creation handler
 */
export declare function createJob(request: CreateJobRequest): Promise<CreateJobResponse>;
/**
 * Get a job by ID
 */
export declare function getJob(jobId: string): Promise<Job | null>;
/**
 * Lambda handler for API Gateway POST /jobs
 */
export declare function createJobHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>;
/**
 * Lambda handler for API Gateway GET /jobs/{jobId}
 */
export declare function getJobHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>;
//# sourceMappingURL=index.d.ts.map