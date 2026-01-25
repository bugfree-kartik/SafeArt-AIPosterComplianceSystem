/**
 * AWS Rekognition Content Moderation
 * 
 * Uses AWS Rekognition DetectModerationLabels API for content analysis
 */

import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  ModerationLabel,
} from '@aws-sdk/client-rekognition';
import { Violation, ComplianceResult, ViolationCode, ViolationSeverity } from '@safeart/shared';
import {
  CompliancePolicy,
  DEFAULT_POLICY,
  REKOGNITION_LABEL_MAP,
  CATEGORY_SEVERITY_MAP,
  meetsThreshold,
} from './policy';

/**
 * Rekognition client configuration
 */
interface RekognitionConfig {
  endpoint?: string;
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Raw moderation result from Rekognition
 */
interface ModerationResult {
  labels: ModerationLabel[];
  modelVersion?: string;
}

/**
 * Rekognition-based compliance checker
 */
export class RekognitionComplianceChecker {
  private client: RekognitionClient;
  private policy: CompliancePolicy;

  constructor(config: RekognitionConfig = {}, policy: CompliancePolicy = DEFAULT_POLICY) {
    const clientConfig: RekognitionConfig = { ...config };

    // Support LocalStack endpoint
    if (process.env.AWS_ENDPOINT_URL) {
      clientConfig.endpoint = process.env.AWS_ENDPOINT_URL;
      clientConfig.region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      };
    }

    this.client = new RekognitionClient(clientConfig);
    this.policy = policy;
  }

  /**
   * Analyze image for content moderation
   */
  async analyzeImage(imageBuffer: Buffer): Promise<ModerationResult> {
    const command = new DetectModerationLabelsCommand({
      Image: {
        Bytes: imageBuffer,
      },
      MinConfidence: this.policy.minOverallConfidence,
    });

    const response = await this.client.send(command);

    return {
      labels: response.ModerationLabels || [],
      modelVersion: response.ModerationModelVersion,
    };
  }

  /**
   * Convert Rekognition labels to violations
   */
  private labelsToViolations(labels: ModerationLabel[]): Violation[] {
    const violations: Violation[] = [];
    const processedCodes = new Set<ViolationCode>();

    for (const label of labels) {
      const labelName = label.Name || '';
      const confidence = label.Confidence || 0;
      const parentName = label.ParentName || '';

      // Get violation code from label or parent
      let violationCode = REKOGNITION_LABEL_MAP[labelName];
      if (!violationCode && parentName) {
        violationCode = REKOGNITION_LABEL_MAP[parentName];
      }

      if (!violationCode) {
        violationCode = ViolationCode.OTHER;
      }

      // Check if meets policy threshold
      if (!meetsThreshold(this.policy, violationCode, confidence)) {
        continue;
      }

      // Avoid duplicate violation codes (keep highest confidence)
      if (processedCodes.has(violationCode)) {
        const existing = violations.find((v) => v.code === violationCode);
        if (existing && existing.confidence >= confidence / 100) {
          continue;
        }
        // Remove lower confidence version
        const index = violations.findIndex((v) => v.code === violationCode);
        if (index !== -1) {
          violations.splice(index, 1);
        }
      }

      // Determine severity
      let severity = CATEGORY_SEVERITY_MAP[labelName] || CATEGORY_SEVERITY_MAP[parentName];
      if (!severity) {
        const rule = this.policy.rules.find((r) => r.code === violationCode);
        severity = rule?.severity || this.policy.defaultSeverity;
      }

      violations.push({
        code: violationCode,
        severity,
        message: `Detected: ${labelName}${parentName ? ` (${parentName})` : ''}`,
        confidence: confidence / 100, // Convert to 0-1 scale
        detectedElements: [labelName, parentName].filter(Boolean),
      });

      processedCodes.add(violationCode);
    }

    // Sort by severity (critical first) then confidence
    return violations.sort((a, b) => {
      const severityOrder = {
        [ViolationSeverity.CRITICAL]: 0,
        [ViolationSeverity.HIGH]: 1,
        [ViolationSeverity.MEDIUM]: 2,
        [ViolationSeverity.LOW]: 3,
      };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Check image compliance
   */
  async checkCompliance(imageBuffer: Buffer): Promise<ComplianceResult> {
    const startTime = Date.now();

    try {
      // Analyze with Rekognition
      const result = await this.analyzeImage(imageBuffer);

      // Convert to violations
      const violations = this.labelsToViolations(result.labels);

      // Determine compliance
      const hasCritical = violations.some((v) => v.severity === ViolationSeverity.CRITICAL);
      const hasHigh = violations.some((v) => v.severity === ViolationSeverity.HIGH);
      const isCompliant = !hasCritical && !hasHigh;

      return {
        isCompliant,
        violations,
        modelOutput: {
          labels: result.labels,
          processingTime: Date.now() - startTime,
        },
        processedAt: new Date().toISOString(),
        modelVersion: result.modelVersion || 'rekognition-v1',
      };
    } catch (error) {
      console.error('Rekognition analysis failed:', error);

      // Return compliant with error info (fail-open for demo)
      return {
        isCompliant: true,
        violations: [],
        modelOutput: {
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime,
        },
        processedAt: new Date().toISOString(),
        modelVersion: 'rekognition-error',
      };
    }
  }
}

export default RekognitionComplianceChecker;
