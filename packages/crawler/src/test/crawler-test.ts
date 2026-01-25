/**
 * Crawler Test Script
 * 
 * Tests the poster crawler in demo mode
 * 
 * Usage:
 *   1. Start LocalStack and set environment variables
 *   2. Build: npm run build
 *   3. Run: npm run test:crawl
 */

import { PosterCrawler, CrawlResults } from '../index';
import { Platform } from '@safeart/shared';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  results?: CrawlResults;
}

const testResults: TestResult[] = [];

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const prefix = { info: '📋', success: '✅', error: '❌', warn: '⚠️' }[type];
  console.log(`${prefix} ${message}`);
}

async function runTest(
  name: string,
  testFn: () => Promise<CrawlResults>
): Promise<TestResult> {
  const startTime = Date.now();
  log(`Running: ${name}`, 'info');

  try {
    const results = await testFn();
    const duration = Date.now() - startTime;
    
    // Check if test passed
    const passed = results.discovered > 0 && results.errors < results.discovered / 2;
    
    if (passed) {
      log(`PASSED: ${name} (${duration}ms)`, 'success');
    } else {
      log(`FAILED: ${name} - Too many errors or no posters discovered`, 'error');
    }
    
    return { name, passed, duration, results };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`FAILED: ${name} - ${errorMessage}`, 'error');
    return { name, passed: false, duration, error: errorMessage };
  }
}

/**
 * Test 1: Demo mode crawler
 */
async function testDemoModeCrawler(): Promise<CrawlResults> {
  const crawler = new PosterCrawler({
    platform: Platform.NETFLIX,
    maxTitles: 5,
    useDemo: true,
    headless: true,
  });

  return crawler.run();
}

/**
 * Test 2: Multiple platforms in demo mode
 */
async function testMultiplePlatforms(): Promise<CrawlResults> {
  const platforms = [Platform.NETFLIX, Platform.PRIME_VIDEO, Platform.DISNEY_PLUS];
  const allResults: CrawlResults = {
    discovered: 0,
    submitted: 0,
    cached: 0,
    skipped: 0,
    errors: 0,
    duration: 0,
  };

  for (const platform of platforms) {
    const crawler = new PosterCrawler({
      platform,
      maxTitles: 3,
      useDemo: true,
      headless: true,
    });

    const results = await crawler.run();
    allResults.discovered += results.discovered;
    allResults.submitted += results.submitted;
    allResults.cached += results.cached;
    allResults.skipped += results.skipped;
    allResults.errors += results.errors;
    allResults.duration += results.duration;
  }

  return allResults;
}

/**
 * Test 3: Cache behavior - same posters submitted twice
 */
async function testCacheBehavior(): Promise<CrawlResults> {
  // First run
  const crawler1 = new PosterCrawler({
    platform: Platform.NETFLIX,
    maxTitles: 3,
    useDemo: true,
    headless: true,
  });

  const firstResults = await crawler1.run();

  // Wait a moment
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Second run - should hit cache
  const crawler2 = new PosterCrawler({
    platform: Platform.NETFLIX,
    maxTitles: 3,
    useDemo: true,
    headless: true,
  });

  const secondResults = await crawler2.run();

  // Combine for summary
  return {
    discovered: firstResults.discovered + secondResults.discovered,
    submitted: firstResults.submitted + secondResults.submitted,
    cached: firstResults.cached + secondResults.cached,
    skipped: firstResults.skipped + secondResults.skipped,
    errors: firstResults.errors + secondResults.errors,
    duration: firstResults.duration + secondResults.duration,
  };
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('CRAWLER TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

  for (const result of testResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${result.name} (${result.duration}ms)`);
    
    if (result.results) {
      console.log(`       └─ Discovered: ${result.results.discovered}, Submitted: ${result.results.submitted}, Cached: ${result.results.cached}, Errors: ${result.results.errors}`);
    }
    
    if (!result.passed && result.error) {
      console.log(`       └─ Error: ${result.error}`);
    }
  }

  console.log('='.repeat(60));
  console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));

  return failed === 0;
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('SafeArt Crawler Tests');
  console.log('='.repeat(60) + '\n');

  // Validate environment
  const requiredVars = ['TABLE_NAME', 'S3_BUCKET', 'SQS_QUEUE_URL'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  
  if (missing.length > 0) {
    log(`Missing environment variables: ${missing.join(', ')}`, 'error');
    log('Please set environment variables for LocalStack', 'warn');
    process.exit(1);
  }

  // Run tests
  testResults.push(await runTest('Demo Mode Crawler', testDemoModeCrawler));
  testResults.push(await runTest('Multiple Platforms', testMultiplePlatforms));
  testResults.push(await runTest('Cache Behavior', testCacheBehavior));

  // Summary
  const success = printSummary();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
