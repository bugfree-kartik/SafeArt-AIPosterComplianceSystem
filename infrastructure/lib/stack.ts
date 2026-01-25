import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as path from 'path';

export class SafeartStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for poster images
    const posterBucket = new s3.Bucket(this, 'PosterBucket', {
      bucketName: `safeart-posters-${this.account}-${this.region}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteOldPosters',
          expiration: cdk.Duration.days(365), // Keep posters for 1 year
        },
      ],
    });

    // DynamoDB Table for jobs
    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `safeart-jobs-${this.node.tryGetContext('env') || 'dev'}`,
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep data on stack deletion
      pointInTimeRecovery: true,
    });

    // GSI for poster hash lookups (cache checking)
    jobsTable.addGlobalSecondaryIndex({
      indexName: 'PosterHashIndex',
      partitionKey: { name: 'posterHash', type: dynamodb.AttributeType.STRING },
    });

    // GSI for status queries
    jobsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Dead Letter Queue
    const dlq = new sqs.Queue(this, 'JobDLQ', {
      queueName: `safeart-jobs-dlq-${this.node.tryGetContext('env') || 'dev'}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main SQS Queue
    const jobQueue = new sqs.Queue(this, 'JobQueue', {
      queueName: `safeart-jobs-${this.node.tryGetContext('env') || 'dev'}`,
      visibilityTimeout: cdk.Duration.minutes(5), // Must be > Lambda timeout
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // Worker Lambda execution role
    const workerLambdaRole = new iam.Role(this, 'WorkerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions
    posterBucket.grantRead(workerLambdaRole);
    jobsTable.grantReadWriteData(workerLambdaRole);

    // Worker Lambda
    const workerLambda = new lambda.Function(this, 'WorkerLambda', {
      functionName: `safeart-worker-${this.node.tryGetContext('env') || 'dev'}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/worker')
      ),
      timeout: cdk.Duration.minutes(3),
      memorySize: 1024,
      role: workerLambdaRole,
      environment: {
        TABLE_NAME: jobsTable.tableName,
        S3_BUCKET: posterBucket.bucketName,
      },
      reservedConcurrentExecutions: 10, // Limit concurrency
    });

    // SQS Event Source for Worker Lambda
    workerLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(jobQueue, {
        batchSize: 1, // Process one job at a time
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // Job Creator Lambda execution role
    const jobCreatorRole = new iam.Role(this, 'JobCreatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    posterBucket.grantReadWrite(jobCreatorRole);
    jobsTable.grantReadWriteData(jobCreatorRole);
    jobQueue.grantSendMessages(jobCreatorRole);

    // Job Creator Lambda (for API)
    const jobCreatorLambda = new lambda.Function(this, 'JobCreatorLambda', {
      functionName: `safeart-job-creator-${this.node.tryGetContext('env') || 'dev'}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.createJobHandler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/job-creator')
      ),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      role: jobCreatorRole,
      environment: {
        TABLE_NAME: jobsTable.tableName,
        S3_BUCKET: posterBucket.bucketName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
      },
    });

    // Optional API Gateway for debugging/inspection
    const api = new apigateway.RestApi(this, 'SafeartApi', {
      restApiName: `safeart-api-${this.node.tryGetContext('env') || 'dev'}`,
      description: 'Internal API for Safeart job management',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const jobsResource = api.root.addResource('jobs');
    jobsResource.addMethod('POST', new apigateway.LambdaIntegration(jobCreatorLambda));

    const jobResource = jobsResource.addResource('{jobId}');
    
    // GET /jobs/{jobId} - Get job by ID
    const getJobLambda = new lambda.Function(this, 'GetJobLambda', {
      functionName: `safeart-get-job-${this.node.tryGetContext('env') || 'dev'}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.getJobHandler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/job-creator')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: jobCreatorRole,
      environment: {
        TABLE_NAME: jobsTable.tableName,
        S3_BUCKET: posterBucket.bucketName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
      },
    });
    
    jobResource.addMethod('GET', new apigateway.LambdaIntegration(getJobLambda));

    // EventBridge Rule for scheduled crawler execution
    const crawlerSchedule = new events.Rule(this, 'CrawlerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(6)), // Run every 6 hours
      description: 'Trigger crawler to discover new posters',
      enabled: false, // Disabled by default - enable when crawler is ready
    });

    // TODO: Add crawler Lambda target when crawler is ready
    // crawlerSchedule.addTarget(new targets.LambdaFunction(crawlerLambda));

    // Outputs
    new cdk.CfnOutput(this, 'PosterBucketName', {
      value: posterBucket.bucketName,
      description: 'S3 bucket for storing poster images',
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: jobsTable.tableName,
      description: 'DynamoDB table for job records',
    });

    new cdk.CfnOutput(this, 'JobQueueUrl', {
      value: jobQueue.queueUrl,
      description: 'SQS queue URL for job processing',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });
  }
}

