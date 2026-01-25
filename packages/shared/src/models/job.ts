/**
 * Job status enumeration
 */
export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CACHED = 'CACHED',
}

/**
 * Platform enumeration for streaming services
 */
export enum Platform {
  NETFLIX = 'NETFLIX',
  PRIME_VIDEO = 'PRIME_VIDEO',
  DISNEY_PLUS = 'DISNEY_PLUS',
  HULU = 'HULU',
  HBO_MAX = 'HBO_MAX',
  APPLE_TV = 'APPLE_TV',
}

/**
 * Compliance violation severity levels
 */
export enum ViolationSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Compliance violation code
 */
export enum ViolationCode {
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  VIOLENCE = 'VIOLENCE',
  NUDITY = 'NUDITY',
  OFFENSIVE_LANGUAGE = 'OFFENSIVE_LANGUAGE',
  DRUGS_ALCOHOL = 'DRUGS_ALCOHOL',
  WEAPONS = 'WEAPONS',
  OTHER = 'OTHER',
}

/**
 * Compliance violation details
 */
export interface Violation {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  confidence: number; // 0-1
  detectedElements?: string[]; // Optional: specific elements detected
}

/**
 * Compliance result structure
 */
export interface ComplianceResult {
  isCompliant: boolean;
  violations: Violation[];
  modelOutput?: Record<string, unknown>; // Raw model output for debugging
  processedAt: string; // ISO timestamp
  modelVersion?: string;
}

/**
 * Poster metadata extracted from source platform
 */
export interface PosterMetadata {
  title: string;
  titleId?: string; // Platform-specific title identifier
  releaseYear?: number;
  genre?: string[];
  rating?: string;
  description?: string;
  cast?: string[];
  director?: string;
  additionalMetadata?: Record<string, unknown>;
}

/**
 * Source platform information
 */
export interface SourcePlatform {
  platform: Platform;
  url: string; // Original poster URL
  pageUrl?: string; // URL of the page where poster was discovered
  discoveredAt: string; // ISO timestamp
}

/**
 * Cache-related fields
 */
export interface CacheInfo {
  posterHash: string; // SHA-256 hash of poster image
  cachedResultId?: string; // Reference to original job if this is a cache hit
  isCacheHit: boolean;
}

/**
 * Job record schema for DynamoDB
 */
export interface Job {
  // Primary key
  jobId: string; // UUID or deterministic ID
  
  // Identifiers
  requestId?: string; // For idempotency
  posterHash: string; // SHA-256 hash of poster image
  
  // Source information
  source: SourcePlatform;
  
  // Poster metadata
  metadata: PosterMetadata;
  
  // Status tracking
  status: JobStatus;
  
  // Timestamps
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  startedAt?: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  
  // Storage references
  s3Bucket: string;
  s3Key: string; // Path to poster image in S3
  
  // Results
  result?: ComplianceResult;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // Cache information
  cache: CacheInfo;
  
  // Processing metadata
  retryCount?: number;
  processingDurationMs?: number;
}

/**
 * SQS message payload for job processing
 */
export interface JobMessage {
  jobId: string;
  s3Bucket: string;
  s3Key: string;
  posterHash: string;
  retryCount?: number;
}

/**
 * Job creation request
 */
export interface CreateJobRequest {
  requestId?: string; // For idempotency
  platform: Platform;
  posterUrl: string;
  pageUrl?: string;
  metadata: PosterMetadata;
}

/**
 * Job creation response
 */
export interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
  isCacheHit: boolean;
  cachedJobId?: string;
  message: string;
}

