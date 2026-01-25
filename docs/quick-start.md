# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- AWS CLI configured
- AWS CDK CLI installed (`npm install -g aws-cdk`)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Build All Packages

```bash
npm run build
```

### 3. Bootstrap CDK (First Time Only)

```bash
cd infrastructure
cdk bootstrap
```

### 4. Deploy Infrastructure

```bash
cdk deploy --context env=dev
```

After deployment, note the outputs:
- `PosterBucketName`
- `JobsTableName`
- `JobQueueUrl`
- `ApiEndpoint`

### 5. Test Job Creation

Use the API Gateway endpoint to create a test job:

```bash
curl -X POST https://<ApiEndpoint>/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "NETFLIX",
    "posterUrl": "https://example.com/poster.jpg",
    "metadata": {
      "title": "Test Movie",
      "releaseYear": 2024
    }
  }'
```

### 6. Check Job Status

Query DynamoDB directly or implement the GET endpoint (Phase 6).

## Project Structure

```
Safeart/
├── packages/
│   ├── shared/          # Shared models and utilities
│   ├── backend/         # Lambda functions
│   └── crawler/         # Nova Act crawler
├── infrastructure/      # AWS CDK code
└── docs/                # Documentation
```

## Development Workflow

1. Make changes to code
2. Build: `npm run build`
3. Test locally (if applicable)
4. Deploy: `cd infrastructure && cdk deploy`
5. Test in AWS

## Next Steps

- Complete Phase 1: Test end-to-end flow
- Implement Phase 3: Nova Act crawler
- Add Phase 5: Compliance model integration
- Build Phase 6: Observability and UI

See `docs/phase-roadmap.md` for detailed phase information.

