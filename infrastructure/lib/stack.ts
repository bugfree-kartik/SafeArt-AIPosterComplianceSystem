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
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Configuration for scheduling and rate limiting
 */
interface SchedulerConfig {
  // Scheduler configuration
  schedulerEnabled: boolean;
  scheduleExpression: string; // e.g., 'rate(6 hours)' or 'cron(0 */6 * * ? *)'
  
  // Rate limiting
  maxQueueDepth: number;
  maxJobsPerCycle: number;
  jobsPerMinute: number;
  
  // Concurrency
  workerConcurrency: number;
  jobCreatorConcurrency: number;
  schedulerConcurrency: number;
  
  // SQS settings
  sqsBatchSize: number;
  sqsBatchingWindowSeconds: number;
  sqsVisibilityTimeoutMinutes: number;
  sqsMaxReceiveCount: number;
  
  // Alarms
  queueDepthAlarmThreshold: number;
  dlqAlarmThreshold: number;
  errorRateAlarmThreshold: number;
}

/**
 * Default scheduler configuration
 */
const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  schedulerEnabled: true,
  scheduleExpression: 'rate(6 hours)',
  maxQueueDepth: 100,
  maxJobsPerCycle: 50,
  jobsPerMinute: 30,
  workerConcurrency: 10,
  jobCreatorConcurrency: 20,
  schedulerConcurrency: 1,
  sqsBatchSize: 1,
  sqsBatchingWindowSeconds: 5,
  sqsVisibilityTimeoutMinutes: 5,
  sqsMaxReceiveCount: 3,
  queueDepthAlarmThreshold: 100,
  dlqAlarmThreshold: 5,
  errorRateAlarmThreshold: 10,
};

export class SafeartStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const envName = this.node.tryGetContext('env') || 'dev';
    
    // Get scheduler configuration from context or use defaults
    const schedulerConfig: SchedulerConfig = {
      ...DEFAULT_SCHEDULER_CONFIG,
      schedulerEnabled: this.node.tryGetContext('schedulerEnabled') ?? DEFAULT_SCHEDULER_CONFIG.schedulerEnabled,
      scheduleExpression: this.node.tryGetContext('scheduleExpression') ?? DEFAULT_SCHEDULER_CONFIG.scheduleExpression,
    };

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
      tableName: `safeart-jobs-${envName}`,
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

    // DynamoDB Table for scheduler runs (tracking crawl history)
    const schedulerTable = new dynamodb.Table(this, 'SchedulerTable', {
      tableName: `safeart-scheduler-${envName}`,
      partitionKey: { name: 'platform', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Can be recreated
      timeToLiveAttribute: 'ttl', // Auto-cleanup old records
    });

    // GSI for querying by status
    schedulerTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'startedAt', type: dynamodb.AttributeType.STRING },
    });

    // Dead Letter Queue
    const dlq = new sqs.Queue(this, 'JobDLQ', {
      queueName: `safeart-jobs-dlq-${envName}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main SQS Queue with optimized settings
    const jobQueue = new sqs.Queue(this, 'JobQueue', {
      queueName: `safeart-jobs-${envName}`,
      visibilityTimeout: cdk.Duration.minutes(schedulerConfig.sqsVisibilityTimeoutMinutes),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: schedulerConfig.sqsMaxReceiveCount,
      },
    });

    // SNS Topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `safeart-alerts-${envName}`,
      displayName: 'SafeArt System Alerts',
    });

    // Worker Lambda execution role
    const workerLambdaRole = new iam.Role(this, 'WorkerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions for Rekognition
    workerLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rekognition:DetectModerationLabels'],
        resources: ['*'],
      })
    );

    // Grant permissions
    posterBucket.grantRead(workerLambdaRole);
    jobsTable.grantReadWriteData(workerLambdaRole);

    // Worker Lambda with tuned concurrency
    const workerLambda = new lambda.Function(this, 'WorkerLambda', {
      functionName: `safeart-worker-${envName}`,
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
        COMPLIANCE_PROVIDER: 'rekognition',
        COMPLIANCE_POLICY: 'default',
      },
      reservedConcurrentExecutions: schedulerConfig.workerConcurrency,
    });

    // SQS Event Source for Worker Lambda with optimized settings
    workerLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(jobQueue, {
        batchSize: schedulerConfig.sqsBatchSize,
        maxBatchingWindow: cdk.Duration.seconds(schedulerConfig.sqsBatchingWindowSeconds),
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

    // Job Creator Lambda (for API) with concurrency limit
    const jobCreatorLambda = new lambda.Function(this, 'JobCreatorLambda', {
      functionName: `safeart-job-creator-${envName}`,
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
      reservedConcurrentExecutions: schedulerConfig.jobCreatorConcurrency,
    });

    // Scheduler Lambda execution role
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant scheduler permissions
    jobsTable.grantReadWriteData(schedulerRole);
    schedulerTable.grantReadWriteData(schedulerRole);
    jobQueue.grantSendMessages(schedulerRole);
    posterBucket.grantReadWrite(schedulerRole);

    // Allow scheduler to get queue attributes for back-pressure
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:GetQueueAttributes'],
        resources: [jobQueue.queueArn],
      })
    );

    // Scheduler Lambda
    const schedulerLambda = new lambda.Function(this, 'SchedulerLambda', {
      functionName: `safeart-scheduler-${envName}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/scheduler')
      ),
      timeout: cdk.Duration.minutes(15), // Long timeout for crawling
      memorySize: 1024,
      role: schedulerRole,
      environment: {
        TABLE_NAME: jobsTable.tableName,
        SCHEDULER_TABLE_NAME: schedulerTable.tableName,
        S3_BUCKET: posterBucket.bucketName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
        MAX_QUEUE_DEPTH: schedulerConfig.maxQueueDepth.toString(),
        MAX_JOBS_PER_CYCLE: schedulerConfig.maxJobsPerCycle.toString(),
        JOBS_PER_MINUTE: schedulerConfig.jobsPerMinute.toString(),
        MIN_CRAWL_INTERVAL_MINUTES: '60',
        USE_DEMO: 'true', // Use demo mode by default
        ENABLED_PLATFORMS: 'NETFLIX',
      },
      reservedConcurrentExecutions: schedulerConfig.schedulerConcurrency,
    });

    // EventBridge Rule for scheduled crawler execution
    const crawlerSchedule = new events.Rule(this, 'CrawlerSchedule', {
      ruleName: `safeart-crawler-schedule-${envName}`,
      schedule: events.Schedule.expression(schedulerConfig.scheduleExpression),
      description: 'Trigger SafeArt crawler to discover new posters',
      enabled: schedulerConfig.schedulerEnabled,
    });

    // Add scheduler Lambda as target
    crawlerSchedule.addTarget(new targets.LambdaFunction(schedulerLambda, {
      retryAttempts: 2,
    }));

    // Per-platform schedules (optional - can be enabled individually)
    const platformSchedules: { [key: string]: string } = {
      'netflix': 'rate(6 hours)',
      'prime-video': 'rate(6 hours)',
      'disney-plus': 'rate(12 hours)',
    };

    // Create per-platform schedule rules (disabled by default)
    for (const [platform, schedule] of Object.entries(platformSchedules)) {
      new events.Rule(this, `Schedule-${platform}`, {
        ruleName: `safeart-schedule-${platform}-${envName}`,
        schedule: events.Schedule.expression(schedule),
        description: `Scheduled crawl for ${platform}`,
        enabled: false, // Enable per-platform when needed
        targets: [new targets.LambdaFunction(schedulerLambda, {
          event: events.RuleTargetInput.fromObject({
            platform: platform.toUpperCase().replace('-', '_'),
          }),
        })],
      });
    }

    // Optional API Gateway for debugging/inspection
    const api = new apigateway.RestApi(this, 'SafeartApi', {
      restApiName: `safeart-api-${envName}`,
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
      functionName: `safeart-get-job-${envName}`,
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

    // Scheduler status endpoint
    const schedulerResource = api.root.addResource('scheduler');
    
    const getSchedulerStatusLambda = new lambda.Function(this, 'GetSchedulerStatusLambda', {
      functionName: `safeart-scheduler-status-${envName}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.getStatusHandler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/scheduler')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: schedulerRole,
      environment: {
        SCHEDULER_TABLE_NAME: schedulerTable.tableName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
      },
    });

    schedulerResource.addMethod('GET', new apigateway.LambdaIntegration(getSchedulerStatusLambda));

    // Trigger scheduler manually via POST
    schedulerResource.addResource('trigger').addMethod('POST', new apigateway.LambdaIntegration(schedulerLambda));

    // ==================== Admin API ====================

    // Admin Lambda execution role
    const adminRole = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    jobsTable.grantReadData(adminRole);
    jobQueue.grantSendMessages(adminRole);

    // Allow admin to get queue attributes
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:GetQueueAttributes'],
        resources: [jobQueue.queueArn, dlq.queueArn],
      })
    );

    // Admin API Lambda
    const adminLambda = new lambda.Function(this, 'AdminLambda', {
      functionName: `safeart-admin-${envName}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.adminHandler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../packages/backend/dist/admin')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      role: adminRole,
      environment: {
        TABLE_NAME: jobsTable.tableName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
        DLQ_URL: dlq.queueUrl,
        LOG_LEVEL: 'INFO',
      },
      tracing: lambda.Tracing.ACTIVE, // Enable X-Ray
    });

    // Admin API endpoints
    const adminResource = api.root.addResource('admin');
    
    // GET /admin/stats - System statistics
    adminResource.addResource('stats').addMethod('GET', new apigateway.LambdaIntegration(adminLambda));
    
    // GET /admin/jobs - List recent jobs
    adminResource.addResource('jobs').addMethod('GET', new apigateway.LambdaIntegration(adminLambda));
    
    // GET /admin/health - Health check
    adminResource.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(adminLambda));

    // Enable X-Ray tracing for other Lambdas
    workerLambda.addEnvironment('AWS_XRAY_TRACING_NAME', 'SafeArt-Worker');
    jobCreatorLambda.addEnvironment('AWS_XRAY_TRACING_NAME', 'SafeArt-JobCreator');
    schedulerLambda.addEnvironment('AWS_XRAY_TRACING_NAME', 'SafeArt-Scheduler');

    // ==================== CloudWatch Alarms ====================

    // Queue Depth Alarm
    const queueDepthAlarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      alarmName: `safeart-queue-depth-${envName}`,
      alarmDescription: 'Alert when job queue depth exceeds threshold',
      metric: jobQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: schedulerConfig.queueDepthAlarmThreshold,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    queueDepthAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    queueDepthAlarm.addOkAction(new cloudwatchActions.SnsAction(alertTopic));

    // DLQ Messages Alarm
    const dlqAlarm = new cloudwatch.Alarm(this, 'DLQAlarm', {
      alarmName: `safeart-dlq-messages-${envName}`,
      alarmDescription: 'Alert when DLQ has messages (failed jobs)',
      metric: dlq.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: schedulerConfig.dlqAlarmThreshold,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    dlqAlarm.addOkAction(new cloudwatchActions.SnsAction(alertTopic));

    // Worker Lambda Errors Alarm
    const workerErrorAlarm = new cloudwatch.Alarm(this, 'WorkerErrorAlarm', {
      alarmName: `safeart-worker-errors-${envName}`,
      alarmDescription: 'Alert when worker Lambda errors exceed threshold',
      metric: workerLambda.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    workerErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    workerErrorAlarm.addOkAction(new cloudwatchActions.SnsAction(alertTopic));

    // Scheduler Lambda Errors Alarm
    const schedulerErrorAlarm = new cloudwatch.Alarm(this, 'SchedulerErrorAlarm', {
      alarmName: `safeart-scheduler-errors-${envName}`,
      alarmDescription: 'Alert when scheduler Lambda fails',
      metric: schedulerLambda.metricErrors({
        period: cdk.Duration.hours(6),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    schedulerErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    schedulerErrorAlarm.addOkAction(new cloudwatchActions.SnsAction(alertTopic));

    // Worker Lambda Duration Alarm (approaching timeout)
    const workerDurationAlarm = new cloudwatch.Alarm(this, 'WorkerDurationAlarm', {
      alarmName: `safeart-worker-duration-${envName}`,
      alarmDescription: 'Alert when worker Lambda duration approaches timeout',
      metric: workerLambda.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: 150000, // 2.5 minutes (timeout is 3 minutes)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    workerDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ==================== CloudWatch Dashboard ====================

    const dashboard = new cloudwatch.Dashboard(this, 'SafeartDashboard', {
      dashboardName: `safeart-operations-${envName}`,
    });

    // Queue metrics row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SQS Queue Depth',
        left: [
          jobQueue.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(1) }),
          jobQueue.metricApproximateNumberOfMessagesNotVisible({ period: cdk.Duration.minutes(1) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DLQ Messages',
        left: [
          dlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(1) }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Current Queue Depth',
        metrics: [jobQueue.metricApproximateNumberOfMessagesVisible()],
        width: 6,
      }),
    );

    // Lambda metrics row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Worker Lambda Invocations',
        left: [
          workerLambda.metricInvocations({ period: cdk.Duration.minutes(5) }),
        ],
        right: [
          workerLambda.metricErrors({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Worker Lambda Duration',
        left: [
          workerLambda.metricDuration({ period: cdk.Duration.minutes(5), statistic: 'p50' }),
          workerLambda.metricDuration({ period: cdk.Duration.minutes(5), statistic: 'p99' }),
        ],
        width: 12,
      }),
    );

    // Scheduler metrics row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Scheduler Lambda',
        left: [
          schedulerLambda.metricInvocations({ period: cdk.Duration.hours(1) }),
        ],
        right: [
          schedulerLambda.metricErrors({ period: cdk.Duration.hours(1) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Job Creator Lambda',
        left: [
          jobCreatorLambda.metricInvocations({ period: cdk.Duration.minutes(5) }),
        ],
        right: [
          jobCreatorLambda.metricErrors({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
    );

    // ==================== Outputs ====================

    new cdk.CfnOutput(this, 'PosterBucketName', {
      value: posterBucket.bucketName,
      description: 'S3 bucket for storing poster images',
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: jobsTable.tableName,
      description: 'DynamoDB table for job records',
    });

    new cdk.CfnOutput(this, 'SchedulerTableName', {
      value: schedulerTable.tableName,
      description: 'DynamoDB table for scheduler run records',
    });

    new cdk.CfnOutput(this, 'JobQueueUrl', {
      value: jobQueue.queueUrl,
      description: 'SQS queue URL for job processing',
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: dlq.queueUrl,
      description: 'Dead Letter Queue URL for failed jobs',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      description: 'SNS topic ARN for alerts (subscribe to receive notifications)',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'SchedulerEnabled', {
      value: schedulerConfig.schedulerEnabled ? 'true' : 'false',
      description: 'Whether the scheduler is enabled',
    });

    new cdk.CfnOutput(this, 'ScheduleExpression', {
      value: schedulerConfig.scheduleExpression,
      description: 'Scheduler cron/rate expression',
    });
  }
}
