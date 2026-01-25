# Data Flow Diagrams

## Job Creation Flow

```
Crawler/API
    │
    │ POST /jobs { platform, posterUrl, metadata }
    ▼
Job Creator Lambda
    │
    ├─► Download image from posterUrl
    │
    ├─► Compute SHA-256 hash
    │
    ├─► Check DynamoDB (PosterHashIndex)
    │   │
    │   ├─► Cache Hit? ──► Return cached result
    │   │
    │   └─► Cache Miss ──► Continue
    │
    ├─► Upload to S3 (posters/{platform}/{hash-prefix}/{hash}.jpg)
    │
    ├─► Create DynamoDB record (status: PENDING)
    │
    └─► Send message to SQS
        │
        └─► { jobId, s3Bucket, s3Key, posterHash }
```

## Job Processing Flow

```
SQS Queue
    │
    │ Triggers Lambda
    ▼
Worker Lambda
    │
    ├─► Read job message
    │
    ├─► Get job from DynamoDB
    │
    ├─► Update status: PROCESSING
    │
    ├─► Download image from S3
    │
    ├─► Run compliance check
    │   │
    │   ├─► Call vision model(s)
    │   │
    │   ├─► Post-process results
    │   │
    │   └─► Generate compliance result
    │
    ├─► Update DynamoDB
    │   │
    │   ├─► status: COMPLETED
    │   │
    │   ├─► result: { isCompliant, violations, ... }
    │   │
    │   └─► completedAt, processingDurationMs
    │
    └─► Success ──► Message deleted from SQS
        │
        └─► Failure ──► Retry (up to 3x) ──► DLQ
```

## Cache Lookup Flow

```
Job Creation Request
    │
    ├─► Compute posterHash
    │
    └─► Query DynamoDB (PosterHashIndex)
        │
        ├─► No match ──► New job
        │
        └─► Match found
            │
            ├─► status = COMPLETED?
            │   │
            │   ├─► Yes ──► Return cached result
            │   │
            │   └─► No ──► Check status
            │       │
            │       ├─► PENDING/PROCESSING ──► Return current status
            │       │
            │       └─► FAILED ──► Create new job (retry)
```

## Crawler Flow

```
EventBridge Schedule
    │
    │ Every 6 hours
    ▼
Crawler Lambda
    │
    ├─► Initialize Nova Act
    │
    ├─► Open browser
    │
    ├─► Navigate to platform catalog
    │
    ├─► Scroll through pages
    │
    ├─► Extract poster data
    │   │
    │   └─► { posterUrl, pageUrl, metadata }
    │
    └─► For each poster
        │
        └─► Call Job Creator Lambda
            │
            └─► Log results (discovered, submitted, cached, errors)
```

