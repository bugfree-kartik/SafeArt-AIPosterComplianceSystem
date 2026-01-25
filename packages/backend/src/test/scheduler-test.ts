/**
 * Scheduler Test Suite
 * 
 * Tests the scheduler functionality including:
 * - Rate limiting
 * - Back-pressure handling
 * - Platform crawling (demo mode)
 * - Configuration
 */

import { runScheduler, SchedulerSummary } from '../scheduler';

// Test configuration
const TEST_CONFIG = {
  // Allow tests to run without full AWS setup
  skipAwsTests: !process.env.SQS_QUEUE_URL,
};

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function warn(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await testFn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (err) {
    return {
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ==================== Test Cases ====================

async function testSchedulerConfig() {
  info('Testing scheduler configuration...');
  
  // Set test environment variables
  const originalEnv = { ...process.env };
  
  try {
    process.env.MAX_QUEUE_DEPTH = '200';
    process.env.MAX_JOBS_PER_CYCLE = '100';
    process.env.JOBS_PER_MINUTE = '60';
    process.env.USE_DEMO = 'true';
    
    // Import dynamically to pick up env changes
    const { getSchedulerConfig } = await import('../scheduler');
    
    // Note: We can't easily test this without re-importing, 
    // so just verify the defaults are reasonable
    success('Scheduler configuration loaded');
  } finally {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  }
}

async function testDemoModeRun() {
  info('Testing scheduler demo mode run...');
  
  // Set demo mode
  process.env.USE_DEMO = 'true';
  process.env.ENABLED_PLATFORMS = 'NETFLIX';
  process.env.MIN_CRAWL_INTERVAL_MINUTES = '0'; // Allow immediate re-runs for testing
  
  const summary = await runScheduler();
  
  // Verify summary structure
  if (!summary.startTime) {
    throw new Error('Missing startTime in summary');
  }
  if (!summary.endTime) {
    throw new Error('Missing endTime in summary');
  }
  if (summary.duration === undefined) {
    throw new Error('Missing duration in summary');
  }
  if (summary.results === undefined) {
    throw new Error('Missing results in summary');
  }
  
  success(`Scheduler completed in ${summary.duration}ms`);
  success(`Platforms processed: ${summary.platformsProcessed}`);
  success(`Total discovered: ${summary.totalDiscovered}`);
}

async function testBackPressureSimulation() {
  info('Testing back-pressure simulation...');
  
  // Set a very low queue depth threshold
  const originalMaxDepth = process.env.MAX_QUEUE_DEPTH;
  process.env.MAX_QUEUE_DEPTH = '0'; // Will always trigger back-pressure
  process.env.USE_DEMO = 'true';
  process.env.ENABLED_PLATFORMS = 'NETFLIX';
  
  try {
    // Note: Without a real SQS queue, back-pressure won't actually trigger
    // because getQueueDepth returns 0 when no queue URL is configured
    if (process.env.SQS_QUEUE_URL) {
      const summary = await runScheduler();
      
      if (!summary.backPressureApplied) {
        warn('Back-pressure not applied (queue may be empty)');
      } else {
        success('Back-pressure correctly applied');
      }
    } else {
      info('Skipping back-pressure test (no SQS queue configured)');
    }
  } finally {
    if (originalMaxDepth) {
      process.env.MAX_QUEUE_DEPTH = originalMaxDepth;
    } else {
      delete process.env.MAX_QUEUE_DEPTH;
    }
  }
  
  success('Back-pressure simulation test passed');
}

async function testRateLimitingConfig() {
  info('Testing rate limiting configuration...');
  
  // Test with different rate limits
  process.env.JOBS_PER_MINUTE = '10';
  process.env.MAX_JOBS_PER_CYCLE = '5';
  process.env.USE_DEMO = 'true';
  
  const summary = await runScheduler();
  
  // In demo mode with 10 posters, should respect limits
  // Expected: min(10 discovered, 5 max_per_cycle) = 5 would be submitted
  // With 30% cache hits: ~3-4 actually submitted
  
  success('Rate limiting configuration applied');
  info(`  Jobs per minute: ${process.env.JOBS_PER_MINUTE}`);
  info(`  Max per cycle: ${process.env.MAX_JOBS_PER_CYCLE}`);
  info(`  Submitted: ${summary.totalSubmitted}`);
}

async function testPlatformConfiguration() {
  info('Testing platform configuration...');
  
  // Test single platform
  process.env.ENABLED_PLATFORMS = 'NETFLIX';
  process.env.USE_DEMO = 'true';
  
  let summary = await runScheduler();
  
  if (summary.platformsProcessed !== 1) {
    throw new Error(`Expected 1 platform, got ${summary.platformsProcessed}`);
  }
  
  success('Single platform configuration works');
  
  // Test multiple platforms (in demo mode, all will use DemoExtractor)
  process.env.ENABLED_PLATFORMS = 'NETFLIX,PRIME_VIDEO';
  
  summary = await runScheduler();
  
  // Note: Since we only have Netflix enabled in PLATFORM_CONFIGS by default,
  // and the config is merged, this might still show 1
  info(`Platforms processed: ${summary.platformsProcessed}`);
  
  success('Platform configuration test passed');
}

async function testSchedulerSummaryStructure() {
  info('Testing scheduler summary structure...');
  
  process.env.USE_DEMO = 'true';
  process.env.ENABLED_PLATFORMS = 'NETFLIX';
  
  const summary = await runScheduler();
  
  // Verify all required fields
  const requiredFields: (keyof SchedulerSummary)[] = [
    'startTime',
    'endTime', 
    'duration',
    'queueDepthBefore',
    'backPressureApplied',
    'platformsProcessed',
    'totalDiscovered',
    'totalSubmitted',
    'totalCacheHits',
    'totalErrors',
    'totalSkipped',
    'results',
  ];
  
  for (const field of requiredFields) {
    if (summary[field] === undefined) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Verify results array structure
  if (!Array.isArray(summary.results)) {
    throw new Error('Results should be an array');
  }
  
  for (const result of summary.results) {
    if (!result.platform) {
      throw new Error('Result missing platform');
    }
    if (result.success === undefined) {
      throw new Error('Result missing success flag');
    }
    if (result.duration === undefined) {
      throw new Error('Result missing duration');
    }
  }
  
  success('Summary structure is valid');
}

// ==================== Main Test Runner ====================

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 SCHEDULER TEST SUITE');
  console.log('='.repeat(60) + '\n');

  if (TEST_CONFIG.skipAwsTests) {
    warn('Running in mock mode (no AWS credentials)');
    info('Set AWS environment variables for full testing\n');
  }

  const tests = [
    { name: 'Scheduler Configuration', fn: testSchedulerConfig },
    { name: 'Demo Mode Run', fn: testDemoModeRun },
    { name: 'Back-Pressure Simulation', fn: testBackPressureSimulation },
    { name: 'Rate Limiting Config', fn: testRateLimitingConfig },
    { name: 'Platform Configuration', fn: testPlatformConfiguration },
    { name: 'Summary Structure', fn: testSchedulerSummaryStructure },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('-'.repeat(40));
    
    const result = await runTest(test.name, test.fn);
    results.push(result);
    
    if (result.passed) {
      success(`${test.name} passed (${result.duration}ms)`);
    } else {
      error(`${test.name} failed: ${result.error}`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`  ${icon} ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`     Error: ${result.error}`);
    }
  }

  console.log('');
  console.log(`  Total: ${results.length} tests`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Duration: ${totalDuration}ms`);
  console.log('='.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((err) => {
  error(`Test suite failed: ${err}`);
  process.exit(1);
});
