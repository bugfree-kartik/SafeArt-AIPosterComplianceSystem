<div align="center">

# 🎨 SafeArt  
### **AI-Powered Poster Compliance System for Streaming Platforms**

A fully serverless, cloud-native system that **discovers**, **analyzes**, and **monitors** poster compliance across streaming platforms using AI and automated crawling.

Built with **AWS**, **Nova Act**, and **TypeScript** for reliability, scalability, and high throughput.

</div>

---

## 🚀 What is SafeArt?

SafeArt is an end-to-end automated pipeline that:

- Crawls posters from streaming platforms (Netflix, Prime Video, etc.)  
- Ingests them into a scalable AWS pipeline  
- Runs AI-driven compliance checks  
- Monitors and stores results for downstream analytics  

It is designed as a **production-grade microservice**, capable of handling **10K+ jobs/hour**, with idempotency, retries, DLQs, and event-driven processing — ideal for compliance automation at scale.

---

## 🏗️ High-Level Architecture



```
┌─────────────┐
│   Crawler   │  (Nova Act + Browser Automation)
│   Service   │
└──────┬──────┘
       │ Discovers posters
       │ Creates jobs
       ▼
┌─────────────────────────────────┐
│      Job Creation Service       │
│  - Downloads poster images      │
│  - Uploads to S3                │
│  - Creates DynamoDB records     │
│  - Pushes to SQS                │
│  - Cache-aware & idempotent    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│         SQS Queue               │
│    (with DLQ)                   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│    Worker Lambda                │
│  - Reads job from SQS           │
│  - Fetches image from S3        │
│  - Runs compliance checks       │
│  - Updates DynamoDB             │
└─────────────────────────────────┘
```


---

## 🔧 Core Components

### **1. Crawler Service**
- Uses **Nova Act** for browser automation  
- Discovers posters & extracts metadata  
- Sends ingestion jobs to backend  

---

### **2. Backend Service**

#### **Job Creator Lambda**
- Downloads poster images  
- Uploads to S3  
- Writes metadata to DynamoDB  
- Pushes messages to SQS  
- Fully **idempotent**, ensures **no duplicate processing**

#### **Worker Lambda**
- Listens to SQS  
- Fetches posters from S3  
- Runs AI compliance checks  
- Updates job state in DynamoDB  

#### **Infrastructure**
- **S3** — poster storage  
- **DynamoDB** — job state storage  
- **SQS** — async job queue  
- **EventBridge** — scheduling (future recurring scans)  

---

### **3. Shared Module**
- Centralized TypeScript models  
- Hashing, validation utilities  
- Compliance schema definitions  

---

## 🧰 Tech Stack

| Category | Technology |
|---------|------------|
| Runtime | Node.js 18+, TypeScript |
| Infra as Code | AWS CDK (TypeScript) |
| Storage | DynamoDB + S3 |
| Messaging | SQS (with DLQ) |
| Compute | AWS Lambda |
| Crawling | Nova Act |
| Scheduling | EventBridge |
| Local Testing | LocalStack |

---

## 📦 Project Structure



## Project Structure

```
Safeart/
├── packages/
│   ├── shared/          # Shared models and utilities
│   ├── backend/         # Lambda functions and infrastructure
│   └── crawler/         # Nova Act crawler service
├── infrastructure/      # AWS CDK infrastructure code
├── docs/                # Architecture and documentation
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- AWS CLI configured (for AWS deployment)
- AWS CDK CLI installed (`npm install -g aws-cdk`) (for AWS deployment)
- Docker (optional, for LocalStack local testing)

### Quick Test Locally

**Fastest way to test without AWS account:**

1. Install LocalStack:
   ```bash
   brew install localstack/tap/localstack-cli
   # OR: pip install localstack
   ```

2. Start LocalStack:
   ```bash
   localstack start
   ```

3. Setup and test:
   ```bash
   npm install
   npm run build
   npm run local:setup
   npm run test:local
   ```

See **[Quick Test Guide](docs/quick-test-guide.md)** for detailed instructions.

### Deploy to AWS

1. Install dependencies:
```bash
npm install
```

2. Bootstrap CDK (first time only):
```bash
cd infrastructure
cdk bootstrap
```

3. Deploy infrastructure:
```bash
cdk deploy --context env=dev
```

4. Test with real AWS:
```bash
npm run build
npm run test:local:job-creator  # Uses real AWS if env vars are set
```

See **[Deployment Guide](docs/deployment.md)** for more details.

## Development Phases

- **Phase 0**: Project & Architecture Setup ✅
- **Phase 1**: Core Pipeline Foundations ✅
- **Phase 2**: Job Creation & Caching Logic ✅
- **Phase 3**: Crawler Integration ✅
- **Phase 4**: Scheduling & Continuous Operation ← Next
- **Phase 5**: Compliance Model & Policy Engine
- **Phase 6**: Observability, Operations & Demo Polish

## Testing

- **[Quick Test Guide](docs/quick-test-guide.md)** - Fastest way to test locally
- **[Local Testing Guide](docs/local-testing.md)** - Comprehensive local testing options
- **[Test Scripts](packages/backend/src/test/README.md)** - Test script documentation

## Environment Variables

See `.env.example` files in each package for required configuration.

## License

MIT

