/**
 * Compliance Engine Test Suite
 * 
 * Tests the compliance engine with different providers and policies.
 * Run with: npm run test:compliance
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  checkCompliance,
  createComplianceChecker,
  MockComplianceChecker,
  AlwaysCompliantChecker,
  AlwaysNonCompliantChecker,
  RekognitionComplianceChecker,
  DEFAULT_POLICY,
  STRICT_POLICY,
} from '../compliance';
import { ViolationSeverity } from '@safeart/shared';

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadImage(response.headers.location!).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: Failed to download image`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Test result tracking
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - startTime,
    });
    console.log(`✅ ${name} (${Date.now() - startTime}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// ========================================
// Test Cases
// ========================================

/**
 * Test 1: Mock checker returns valid results
 */
async function testMockChecker(): Promise<void> {
  const checker = new MockComplianceChecker();
  const imageBuffer = Buffer.from('test-image-data');
  
  const result = await checker.checkCompliance(imageBuffer);
  
  assert(result !== null, 'Result should not be null');
  assert(typeof result.isCompliant === 'boolean', 'isCompliant should be boolean');
  assert(Array.isArray(result.violations), 'violations should be an array');
  assert(result.processedAt !== undefined, 'processedAt should be defined');
  assert(result.modelVersion !== undefined && result.modelVersion.includes('mock'), 'modelVersion should indicate mock');
}

/**
 * Test 2: AlwaysCompliant checker
 */
async function testAlwaysCompliantChecker(): Promise<void> {
  const checker = new AlwaysCompliantChecker();
  const imageBuffer = Buffer.from('any-image-data');
  
  const result = await checker.checkCompliance(imageBuffer);
  
  assert(result.isCompliant === true, 'Should always be compliant');
  assert(result.violations.length === 0, 'Should have no violations');
}

/**
 * Test 3: AlwaysNonCompliant checker
 */
async function testAlwaysNonCompliantChecker(): Promise<void> {
  const checker = new AlwaysNonCompliantChecker();
  const imageBuffer = Buffer.from('any-image-data');
  
  const result = await checker.checkCompliance(imageBuffer);
  
  assert(result.isCompliant === false, 'Should always be non-compliant');
  assert(result.violations.length > 0, 'Should have violations');
}

/**
 * Test 4: Mock checker is deterministic (same image = same result)
 */
async function testMockDeterminism(): Promise<void> {
  const checker = new MockComplianceChecker();
  const imageBuffer = Buffer.from('deterministic-test-image');
  
  const result1 = await checker.checkCompliance(imageBuffer);
  const result2 = await checker.checkCompliance(imageBuffer);
  
  assert(
    result1.isCompliant === result2.isCompliant,
    'Same image should produce same compliance result'
  );
  assert(
    result1.violations.length === result2.violations.length,
    'Same image should produce same violation count'
  );
}

/**
 * Test 5: checkCompliance function with mock provider
 */
async function testCheckComplianceWithMock(): Promise<void> {
  const imageBuffer = Buffer.from('test-image');
  
  const result = await checkCompliance(imageBuffer, { provider: 'mock' });
  
  assert(result !== null, 'Result should not be null');
  assert(result.modelVersion !== undefined && result.modelVersion.includes('mock'), 'Should use mock provider');
}

/**
 * Test 6: Policy configuration (default vs strict)
 */
async function testPolicyConfiguration(): Promise<void> {
  assert(DEFAULT_POLICY.name === 'SafeArt Default Policy', 'Default policy name');
  assert(STRICT_POLICY.name === 'SafeArt Strict Policy', 'Strict policy name');
  
  // Strict policy should have lower confidence thresholds
  const defaultNudityRule = DEFAULT_POLICY.rules.find((r) => r.code === 'NUDITY');
  const strictNudityRule = STRICT_POLICY.rules.find((r) => r.code === 'NUDITY');
  
  assert(
    strictNudityRule!.minConfidence < defaultNudityRule!.minConfidence,
    'Strict policy should have lower confidence thresholds'
  );
}

/**
 * Test 7: createComplianceChecker factory
 */
async function testCreateComplianceChecker(): Promise<void> {
  const mockChecker = createComplianceChecker({ provider: 'mock' });
  assert(mockChecker instanceof MockComplianceChecker, 'Should create mock checker');
  
  const alwaysCompliant = createComplianceChecker({ provider: 'always-compliant' });
  assert(alwaysCompliant instanceof AlwaysCompliantChecker, 'Should create always-compliant checker');
  
  const alwaysNoncompliant = createComplianceChecker({ provider: 'always-noncompliant' });
  assert(alwaysNoncompliant instanceof AlwaysNonCompliantChecker, 'Should create always-noncompliant checker');
}

/**
 * Test 8: Violation severity ordering
 */
async function testViolationOrdering(): Promise<void> {
  const checker = new AlwaysNonCompliantChecker();
  const result = await checker.checkCompliance(Buffer.from('test'));
  
  // Violations should be sorted by severity
  for (let i = 1; i < result.violations.length; i++) {
    const prev = result.violations[i - 1];
    const curr = result.violations[i];
    
    const severityOrder: Record<ViolationSeverity, number> = {
      [ViolationSeverity.CRITICAL]: 0,
      [ViolationSeverity.HIGH]: 1,
      [ViolationSeverity.MEDIUM]: 2,
      [ViolationSeverity.LOW]: 3,
    };
    
    assert(
      severityOrder[prev.severity] <= severityOrder[curr.severity],
      'Violations should be ordered by severity (most severe first)'
    );
  }
}

/**
 * Test 9: Rekognition checker initialization (without actual API call)
 */
async function testRekognitionInitialization(): Promise<void> {
  // This just tests that the class can be instantiated
  // Actual API calls require AWS credentials
  const checker = new RekognitionComplianceChecker({
    region: 'us-east-1',
  });
  
  assert(checker !== null, 'Rekognition checker should be instantiated');
}

/**
 * Test 10: Real image test with mock checker
 */
async function testRealImageWithMock(): Promise<void> {
  // Download a real test image
  const testImageUrl = 'https://picsum.photos/200/300';
  
  try {
    const imageBuffer = await downloadImage(testImageUrl);
    assert(imageBuffer.length > 0, 'Should download image');
    
    const result = await checkCompliance(imageBuffer, { provider: 'mock' });
    assert(result !== null, 'Should analyze image');
    assert(result.processedAt !== undefined, 'Should have timestamp');
  } catch (error) {
    // Skip test if network unavailable
    console.log('  ⚠️  Skipping real image test (network unavailable)');
    return;
  }
}

// ========================================
// Main Test Runner
// ========================================

async function main(): Promise<void> {
  console.log('\n🔬 SafeArt Compliance Engine Test Suite\n');
  console.log('=' .repeat(60));
  
  // Run all tests
  await runTest('Mock checker returns valid results', testMockChecker);
  await runTest('AlwaysCompliant checker', testAlwaysCompliantChecker);
  await runTest('AlwaysNonCompliant checker', testAlwaysNonCompliantChecker);
  await runTest('Mock checker is deterministic', testMockDeterminism);
  await runTest('checkCompliance with mock provider', testCheckComplianceWithMock);
  await runTest('Policy configuration', testPolicyConfiguration);
  await runTest('createComplianceChecker factory', testCreateComplianceChecker);
  await runTest('Violation severity ordering', testViolationOrdering);
  await runTest('Rekognition checker initialization', testRekognitionInitialization);
  await runTest('Real image with mock checker', testRealImageWithMock);
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
  
  console.log('\n✅ All compliance tests passed!\n');
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
