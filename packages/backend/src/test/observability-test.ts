/**
 * Observability Test Suite
 * 
 * Tests logging, metrics, and tracing utilities.
 */

import {
  Logger,
  LogLevel,
  createLogger,
  generateCorrelationId,
  MetricName,
  createMetricsCollector,
  createEMFLogger,
  createTracer,
  getTraceContext,
} from '../observability';

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

// ==================== Logger Tests ====================

async function testLoggerCreation() {
  info('Testing logger creation...');
  
  const logger = createLogger('test-component');
  
  if (!logger) {
    throw new Error('Logger was not created');
  }
  
  success('Logger created successfully');
}

async function testLoggerOutput() {
  info('Testing logger output...');
  
  const logger = createLogger('test-component', { minLevel: LogLevel.DEBUG });
  
  // Capture console output
  const outputs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (msg: string) => outputs.push(msg);
  console.error = (msg: string) => outputs.push(msg);
  console.warn = (msg: string) => outputs.push(msg);
  
  try {
    logger.debug('Debug message', { key: 'value' });
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message', new Error('Test error'));
    
    // Verify outputs are JSON
    for (const output of outputs) {
      const parsed = JSON.parse(output);
      if (!parsed.timestamp || !parsed.level || !parsed.message) {
        throw new Error('Log output missing required fields');
      }
    }
    
    if (outputs.length !== 4) {
      throw new Error(`Expected 4 log outputs, got ${outputs.length}`);
    }
    
    success('Logger output is valid JSON with required fields');
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

async function testCorrelationId() {
  info('Testing correlation ID generation...');
  
  const id1 = generateCorrelationId();
  const id2 = generateCorrelationId();
  
  if (!id1 || id1.length < 10) {
    throw new Error('Correlation ID too short');
  }
  
  if (id1 === id2) {
    throw new Error('Correlation IDs should be unique');
  }
  
  success('Correlation IDs are unique and properly formatted');
}

async function testChildLogger() {
  info('Testing child logger...');
  
  const logger = createLogger('parent');
  logger.setCorrelationId('test-correlation-id');
  
  const child = logger.child('child');
  
  // Capture output
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => outputs.push(msg);
  
  try {
    child.info('Child message');
    
    const parsed = JSON.parse(outputs[0]);
    if (!parsed.component.includes('child')) {
      throw new Error('Child logger should have child component');
    }
    if (parsed.correlationId !== 'test-correlation-id') {
      throw new Error('Child logger should inherit correlation ID');
    }
    
    success('Child logger inherits context correctly');
  } finally {
    console.log = originalLog;
  }
}

async function testLoggerTimer() {
  info('Testing logger timer...');
  
  const logger = createLogger('test');
  
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => outputs.push(msg);
  
  try {
    const done = logger.startTimer('test-operation');
    await new Promise((resolve) => setTimeout(resolve, 50));
    done();
    
    // Should have start and complete logs
    if (outputs.length < 1) {
      throw new Error('Timer should produce log output');
    }
    
    const lastLog = JSON.parse(outputs[outputs.length - 1]);
    if (!lastLog.data?.duration || lastLog.data.duration < 50) {
      throw new Error('Timer should record duration');
    }
    
    success('Logger timer records duration correctly');
  } finally {
    console.log = originalLog;
  }
}

// ==================== Metrics Tests ====================

async function testMetricsCollector() {
  info('Testing metrics collector...');
  
  const collector = createMetricsCollector('test');
  
  collector.count(MetricName.JOBS_CREATED, 5);
  collector.duration(MetricName.PROCESSING_DURATION, 1500);
  
  const metrics = collector.getMetrics();
  
  if (metrics.length !== 2) {
    throw new Error(`Expected 2 metrics, got ${metrics.length}`);
  }
  
  const countMetric = metrics.find((m) => m.name === MetricName.JOBS_CREATED);
  if (!countMetric || countMetric.value !== 5) {
    throw new Error('Count metric not recorded correctly');
  }
  
  const durationMetric = metrics.find((m) => m.name === MetricName.PROCESSING_DURATION);
  if (!durationMetric || durationMetric.value !== 1500) {
    throw new Error('Duration metric not recorded correctly');
  }
  
  success('Metrics collector records metrics correctly');
}

async function testMetricsTime() {
  info('Testing metrics timing...');
  
  const collector = createMetricsCollector('test');
  
  const result = await collector.time(
    MetricName.COMPLIANCE_CHECK_DURATION,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'test-result';
    }
  );
  
  if (result !== 'test-result') {
    throw new Error('Time function should return result');
  }
  
  const metrics = collector.getMetrics();
  const durationMetric = metrics.find((m) => m.name === MetricName.COMPLIANCE_CHECK_DURATION);
  
  if (!durationMetric || durationMetric.value < 50) {
    throw new Error('Time function should record duration');
  }
  
  success('Metrics timing works correctly');
}

async function testEMFLogger() {
  info('Testing EMF logger...');
  
  const outputs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => outputs.push(msg);
  
  try {
    const emf = createEMFLogger();
    emf.setDimension('Component', 'Test');
    emf.putMetric('TestCount', 5, 'Count');
    emf.putMetric('TestDuration', 100, 'Milliseconds');
    emf.setProperty('testProperty', 'value');
    emf.flush();
    
    if (outputs.length !== 1) {
      throw new Error('EMF should produce one output');
    }
    
    const parsed = JSON.parse(outputs[0]);
    
    if (!parsed._aws || !parsed._aws.CloudWatchMetrics) {
      throw new Error('EMF output should have _aws metadata');
    }
    
    if (parsed.TestCount !== 5 || parsed.TestDuration !== 100) {
      throw new Error('EMF should include metric values');
    }
    
    success('EMF logger produces valid CloudWatch EMF format');
  } finally {
    console.log = originalLog;
  }
}

// ==================== Tracing Tests ====================

async function testTracerCreation() {
  info('Testing tracer creation...');
  
  const tracer = createTracer('test-component');
  
  if (!tracer) {
    throw new Error('Tracer was not created');
  }
  
  // In test environment, X-Ray is not enabled
  if (tracer.isEnabled()) {
    info('X-Ray tracing is enabled');
  } else {
    info('X-Ray tracing is not enabled (expected in test)');
  }
  
  success('Tracer created successfully');
}

async function testTraceContext() {
  info('Testing trace context...');
  
  const context = getTraceContext();
  
  // In test environment, there's no trace context
  if (!context.traceId) {
    info('No trace context available (expected in test)');
  }
  
  success('Trace context retrieval works');
}

async function testTracerWrap() {
  info('Testing tracer wrap function...');
  
  const tracer = createTracer('test');
  
  const result = await tracer.trace(
    'test-operation',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 42;
    },
    { testKey: 'testValue' }
  );
  
  if (result !== 42) {
    throw new Error('Tracer wrap should return function result');
  }
  
  success('Tracer wrap function works correctly');
}

// ==================== Main Test Runner ====================

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 OBSERVABILITY TEST SUITE');
  console.log('='.repeat(60) + '\n');

  const tests = [
    // Logger tests
    { name: 'Logger Creation', fn: testLoggerCreation },
    { name: 'Logger Output', fn: testLoggerOutput },
    { name: 'Correlation ID', fn: testCorrelationId },
    { name: 'Child Logger', fn: testChildLogger },
    { name: 'Logger Timer', fn: testLoggerTimer },
    // Metrics tests
    { name: 'Metrics Collector', fn: testMetricsCollector },
    { name: 'Metrics Timing', fn: testMetricsTime },
    { name: 'EMF Logger', fn: testEMFLogger },
    // Tracing tests
    { name: 'Tracer Creation', fn: testTracerCreation },
    { name: 'Trace Context', fn: testTraceContext },
    { name: 'Tracer Wrap', fn: testTracerWrap },
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

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((err) => {
  error(`Test suite failed: ${err}`);
  process.exit(1);
});
