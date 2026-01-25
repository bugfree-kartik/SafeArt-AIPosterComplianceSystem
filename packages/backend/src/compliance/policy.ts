/**
 * Compliance Policy Schema
 * 
 * Defines violation categories, severity levels, and policy rules
 * for poster compliance checking.
 */

import { ViolationCode, ViolationSeverity } from '@safeart/shared';

/**
 * Policy rule configuration
 */
export interface PolicyRule {
  code: ViolationCode;
  enabled: boolean;
  severity: ViolationSeverity;
  minConfidence: number; // 0-100, minimum confidence to trigger
  description: string;
}

/**
 * Compliance policy configuration
 */
export interface CompliancePolicy {
  name: string;
  version: string;
  rules: PolicyRule[];
  defaultSeverity: ViolationSeverity;
  minOverallConfidence: number;
}

/**
 * Rekognition moderation label mapping to our violation codes
 */
export const REKOGNITION_LABEL_MAP: Record<string, ViolationCode> = {
  // Explicit content
  'Explicit Nudity': ViolationCode.NUDITY,
  'Nudity': ViolationCode.NUDITY,
  'Graphic Male Nudity': ViolationCode.NUDITY,
  'Graphic Female Nudity': ViolationCode.NUDITY,
  'Sexual Activity': ViolationCode.NUDITY,
  'Illustrated Explicit Nudity': ViolationCode.NUDITY,
  'Adult Toys': ViolationCode.INAPPROPRIATE_CONTENT,
  
  // Violence
  'Graphic Violence Or Gore': ViolationCode.VIOLENCE,
  'Violence': ViolationCode.VIOLENCE,
  'Physical Violence': ViolationCode.VIOLENCE,
  'Weapon Violence': ViolationCode.VIOLENCE,
  'Weapons': ViolationCode.WEAPONS,
  'Self Injury': ViolationCode.VIOLENCE,
  
  // Suggestive content
  'Suggestive': ViolationCode.INAPPROPRIATE_CONTENT,
  'Female Swimwear Or Underwear': ViolationCode.INAPPROPRIATE_CONTENT,
  'Male Swimwear Or Underwear': ViolationCode.INAPPROPRIATE_CONTENT,
  'Partial Nudity': ViolationCode.INAPPROPRIATE_CONTENT,
  'Barechested Male': ViolationCode.INAPPROPRIATE_CONTENT,
  'Revealing Clothes': ViolationCode.INAPPROPRIATE_CONTENT,
  'Sexual Situations': ViolationCode.INAPPROPRIATE_CONTENT,
  
  // Drugs/Alcohol
  'Drug Use': ViolationCode.DRUGS_ALCOHOL,
  'Drugs': ViolationCode.DRUGS_ALCOHOL,
  'Drug Paraphernalia': ViolationCode.DRUGS_ALCOHOL,
  'Tobacco': ViolationCode.DRUGS_ALCOHOL,
  'Tobacco Products': ViolationCode.DRUGS_ALCOHOL,
  'Smoking': ViolationCode.DRUGS_ALCOHOL,
  'Drinking': ViolationCode.DRUGS_ALCOHOL,
  'Alcoholic Beverages': ViolationCode.DRUGS_ALCOHOL,
  
  // Hate/Offensive
  'Hate Symbols': ViolationCode.OFFENSIVE_LANGUAGE,
  'Nazi Party': ViolationCode.OFFENSIVE_LANGUAGE,
  'White Supremacy': ViolationCode.OFFENSIVE_LANGUAGE,
  'Extremist': ViolationCode.OFFENSIVE_LANGUAGE,
  
  // Gambling
  'Gambling': ViolationCode.OTHER,
  
  // Rude gestures
  'Rude Gestures': ViolationCode.OFFENSIVE_LANGUAGE,
  'Middle Finger': ViolationCode.OFFENSIVE_LANGUAGE,
};

/**
 * Severity mapping for Rekognition categories
 */
export const CATEGORY_SEVERITY_MAP: Record<string, ViolationSeverity> = {
  'Explicit Nudity': ViolationSeverity.CRITICAL,
  'Graphic Violence Or Gore': ViolationSeverity.CRITICAL,
  'Violence': ViolationSeverity.HIGH,
  'Weapons': ViolationSeverity.HIGH,
  'Nudity': ViolationSeverity.HIGH,
  'Sexual Activity': ViolationSeverity.CRITICAL,
  'Drug Use': ViolationSeverity.HIGH,
  'Hate Symbols': ViolationSeverity.CRITICAL,
  'Suggestive': ViolationSeverity.MEDIUM,
  'Partial Nudity': ViolationSeverity.MEDIUM,
  'Tobacco': ViolationSeverity.LOW,
  'Drinking': ViolationSeverity.LOW,
  'Gambling': ViolationSeverity.LOW,
};

/**
 * Default compliance policy
 */
export const DEFAULT_POLICY: CompliancePolicy = {
  name: 'SafeArt Default Policy',
  version: '1.0.0',
  rules: [
    {
      code: ViolationCode.NUDITY,
      enabled: true,
      severity: ViolationSeverity.CRITICAL,
      minConfidence: 70,
      description: 'Explicit or partial nudity detected',
    },
    {
      code: ViolationCode.VIOLENCE,
      enabled: true,
      severity: ViolationSeverity.HIGH,
      minConfidence: 75,
      description: 'Violence or gore content detected',
    },
    {
      code: ViolationCode.WEAPONS,
      enabled: true,
      severity: ViolationSeverity.HIGH,
      minConfidence: 80,
      description: 'Weapons detected in image',
    },
    {
      code: ViolationCode.DRUGS_ALCOHOL,
      enabled: true,
      severity: ViolationSeverity.MEDIUM,
      minConfidence: 75,
      description: 'Drug or alcohol content detected',
    },
    {
      code: ViolationCode.OFFENSIVE_LANGUAGE,
      enabled: true,
      severity: ViolationSeverity.HIGH,
      minConfidence: 80,
      description: 'Offensive symbols or gestures detected',
    },
    {
      code: ViolationCode.INAPPROPRIATE_CONTENT,
      enabled: true,
      severity: ViolationSeverity.MEDIUM,
      minConfidence: 70,
      description: 'Suggestive or inappropriate content detected',
    },
    {
      code: ViolationCode.OTHER,
      enabled: true,
      severity: ViolationSeverity.LOW,
      minConfidence: 80,
      description: 'Other potentially problematic content detected',
    },
  ],
  defaultSeverity: ViolationSeverity.MEDIUM,
  minOverallConfidence: 60,
};

/**
 * Strict policy for family-friendly content
 */
export const STRICT_POLICY: CompliancePolicy = {
  name: 'SafeArt Strict Policy',
  version: '1.0.0',
  rules: DEFAULT_POLICY.rules.map((rule) => ({
    ...rule,
    minConfidence: Math.max(50, rule.minConfidence - 20), // Lower threshold
    severity: rule.severity === ViolationSeverity.LOW 
      ? ViolationSeverity.MEDIUM 
      : rule.severity,
  })),
  defaultSeverity: ViolationSeverity.HIGH,
  minOverallConfidence: 50,
};

/**
 * Get policy by name
 */
export function getPolicy(name: 'default' | 'strict' = 'default'): CompliancePolicy {
  switch (name) {
    case 'strict':
      return STRICT_POLICY;
    default:
      return DEFAULT_POLICY;
  }
}

/**
 * Check if a violation passes the policy threshold
 */
export function meetsThreshold(
  policy: CompliancePolicy,
  violationCode: ViolationCode,
  confidence: number
): boolean {
  const rule = policy.rules.find((r) => r.code === violationCode);
  
  if (!rule || !rule.enabled) {
    return false;
  }
  
  return confidence >= rule.minConfidence;
}

export default DEFAULT_POLICY;
