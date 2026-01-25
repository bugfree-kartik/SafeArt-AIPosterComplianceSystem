/**
 * Mock Compliance Checker
 * 
 * For local testing without AWS Rekognition
 * Simulates realistic compliance results based on image content
 */

import { ComplianceResult, Violation, ViolationCode, ViolationSeverity } from '@safeart/shared';
import { CompliancePolicy, DEFAULT_POLICY } from './policy';
import * as crypto from 'crypto';

/**
 * Mock compliance checker for testing
 */
export class MockComplianceChecker {
  private policy: CompliancePolicy;

  constructor(policy: CompliancePolicy = DEFAULT_POLICY) {
    this.policy = policy;
  }

  /**
   * Generate deterministic "random" results based on image hash
   * This ensures same image always gets same result
   */
  private getImageSeed(imageBuffer: Buffer): number {
    const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Simulate compliance check with realistic results
   */
  async checkCompliance(imageBuffer: Buffer): Promise<ComplianceResult> {
    const startTime = Date.now();
    const seed = this.getImageSeed(imageBuffer);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 50 + (seed % 100)));

    // Determine if we should generate violations (20% chance based on seed)
    const generateViolations = seed % 5 === 0;

    const violations: Violation[] = [];

    if (generateViolations) {
      // Generate 1-3 violations based on seed
      const numViolations = 1 + (seed % 3);
      const possibleViolations: Violation[] = [
        {
          code: ViolationCode.INAPPROPRIATE_CONTENT,
          severity: ViolationSeverity.MEDIUM,
          message: 'Detected: Suggestive content',
          confidence: 0.72 + (seed % 20) / 100,
          detectedElements: ['Suggestive', 'Revealing Clothes'],
        },
        {
          code: ViolationCode.VIOLENCE,
          severity: ViolationSeverity.HIGH,
          message: 'Detected: Violence imagery',
          confidence: 0.81 + (seed % 15) / 100,
          detectedElements: ['Violence', 'Physical Violence'],
        },
        {
          code: ViolationCode.WEAPONS,
          severity: ViolationSeverity.HIGH,
          message: 'Detected: Weapons',
          confidence: 0.78 + (seed % 18) / 100,
          detectedElements: ['Weapons'],
        },
        {
          code: ViolationCode.DRUGS_ALCOHOL,
          severity: ViolationSeverity.MEDIUM,
          message: 'Detected: Alcohol content',
          confidence: 0.65 + (seed % 25) / 100,
          detectedElements: ['Drinking', 'Alcoholic Beverages'],
        },
      ];

      // Pick violations based on seed
      for (let i = 0; i < numViolations && i < possibleViolations.length; i++) {
        const index = (seed + i) % possibleViolations.length;
        violations.push(possibleViolations[index]);
      }
    }

    // Check for critical/high violations
    const hasCritical = violations.some((v) => v.severity === ViolationSeverity.CRITICAL);
    const hasHigh = violations.some((v) => v.severity === ViolationSeverity.HIGH);
    const isCompliant = !hasCritical && !hasHigh;

    return {
      isCompliant,
      violations,
      modelOutput: {
        mock: true,
        seed,
        processingTime: Date.now() - startTime,
      },
      processedAt: new Date().toISOString(),
      modelVersion: 'mock-v1',
    };
  }
}

/**
 * Always-compliant checker for basic testing
 */
export class AlwaysCompliantChecker {
  async checkCompliance(imageBuffer: Buffer): Promise<ComplianceResult> {
    // Simulate minimal delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      isCompliant: true,
      violations: [],
      modelOutput: { placeholder: true },
      processedAt: new Date().toISOString(),
      modelVersion: 'always-compliant-v1',
    };
  }
}

/**
 * Always-non-compliant checker for testing violation handling
 */
export class AlwaysNonCompliantChecker {
  async checkCompliance(imageBuffer: Buffer): Promise<ComplianceResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      isCompliant: false,
      violations: [
        {
          code: ViolationCode.INAPPROPRIATE_CONTENT,
          severity: ViolationSeverity.HIGH,
          message: 'Test violation - always triggers',
          confidence: 0.95,
          detectedElements: ['Test Content'],
        },
      ],
      modelOutput: { testMode: true },
      processedAt: new Date().toISOString(),
      modelVersion: 'always-noncompliant-v1',
    };
  }
}

export default MockComplianceChecker;
