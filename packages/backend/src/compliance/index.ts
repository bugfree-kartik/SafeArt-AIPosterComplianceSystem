/**
 * Compliance Engine
 * 
 * Main entry point for compliance checking
 * Supports multiple providers: Rekognition, Mock, etc.
 */

import { ComplianceResult } from '@safeart/shared';
import { CompliancePolicy, DEFAULT_POLICY, STRICT_POLICY, getPolicy } from './policy';
import { RekognitionComplianceChecker } from './rekognition';
import { MockComplianceChecker, AlwaysCompliantChecker, AlwaysNonCompliantChecker } from './mock';

/**
 * Compliance checker interface
 */
export interface ComplianceChecker {
  checkCompliance(imageBuffer: Buffer): Promise<ComplianceResult>;
}

/**
 * Available compliance providers
 */
export type ComplianceProvider = 'rekognition' | 'mock' | 'always-compliant' | 'always-noncompliant';

/**
 * Compliance engine configuration
 */
export interface ComplianceEngineConfig {
  provider: ComplianceProvider;
  policy?: 'default' | 'strict';
  customPolicy?: CompliancePolicy;
}

/**
 * Default configuration based on environment
 */
function getDefaultConfig(): ComplianceEngineConfig {
  // Use mock in test/local environment, rekognition in production
  const isLocal = !!process.env.AWS_ENDPOINT_URL;
  const isTest = process.env.NODE_ENV === 'test';
  const forceMock = process.env.USE_MOCK_COMPLIANCE === 'true';
  const forceRekognition = process.env.USE_REKOGNITION === 'true';

  let provider: ComplianceProvider = 'rekognition';

  if (forceMock) {
    provider = 'mock';
  } else if (forceRekognition) {
    provider = 'rekognition';
  } else if (isLocal || isTest) {
    provider = 'mock';
  }

  return {
    provider,
    policy: 'default',
  };
}

/**
 * Create compliance checker based on configuration
 */
export function createComplianceChecker(config?: Partial<ComplianceEngineConfig>): ComplianceChecker {
  const finalConfig: ComplianceEngineConfig = {
    ...getDefaultConfig(),
    ...config,
  };

  // Get policy
  const policy = finalConfig.customPolicy || getPolicy(finalConfig.policy);

  console.log(`Creating compliance checker: provider=${finalConfig.provider}, policy=${policy.name}`);

  switch (finalConfig.provider) {
    case 'rekognition':
      return new RekognitionComplianceChecker({}, policy);

    case 'mock':
      return new MockComplianceChecker(policy);

    case 'always-compliant':
      return new AlwaysCompliantChecker();

    case 'always-noncompliant':
      return new AlwaysNonCompliantChecker();

    default:
      console.warn(`Unknown provider: ${finalConfig.provider}, falling back to mock`);
      return new MockComplianceChecker(policy);
  }
}

/**
 * Main compliance check function
 * Uses configured provider to analyze image
 */
export async function checkCompliance(
  imageBuffer: Buffer,
  config?: Partial<ComplianceEngineConfig>
): Promise<ComplianceResult> {
  const checker = createComplianceChecker(config);
  return checker.checkCompliance(imageBuffer);
}

// Export all components
export { CompliancePolicy, DEFAULT_POLICY, STRICT_POLICY, getPolicy } from './policy';
export { RekognitionComplianceChecker } from './rekognition';
export { MockComplianceChecker, AlwaysCompliantChecker, AlwaysNonCompliantChecker } from './mock';
