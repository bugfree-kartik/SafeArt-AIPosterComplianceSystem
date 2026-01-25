/**
 * Local test script for job creator
 * 
 * Usage:
 *   1. Set environment variables (see local-testing.md)
 *   2. Build: npm run build
 *   3. Run: node dist/test/job-creator-test.js
 */

import { createJob } from '../job-creator';
import { Platform } from '@safeart/shared';

async function main() {
  // Validate environment variables
  const requiredEnvVars = ['TABLE_NAME', 'S3_BUCKET', 'SQS_QUEUE_URL'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('\nSet them with:');
    console.error('  export TABLE_NAME=safeart-jobs-dev');
    console.error('  export S3_BUCKET=safeart-posters-local');
    console.error('  export SQS_QUEUE_URL=http://localhost:4566/000000000000/safeart-jobs-dev');
    process.exit(1);
  }

  console.log('Environment:');
  console.log('  TABLE_NAME:', process.env.TABLE_NAME);
  console.log('  S3_BUCKET:', process.env.S3_BUCKET);
  console.log('  SQS_QUEUE_URL:', process.env.SQS_QUEUE_URL);
  console.log('  AWS_ENDPOINT_URL:', process.env.AWS_ENDPOINT_URL || 'default (real AWS)');
  console.log('');

  // Test job creation
  const testRequest = {
    platform: Platform.NETFLIX,
    posterUrl: 'https://picsum.photos/300/450', // Use a reliable image service
    metadata: {
      title: 'Test Movie',
      releaseYear: 2024,
      genre: ['Action', 'Drama'],
    },
  };

  console.log('Creating test job...');
  console.log('Request:', JSON.stringify(testRequest, null, 2));
  console.log('');

  try {
    const result = await createJob(testRequest);
    console.log('✅ Job creation successful!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.isCacheHit) {
      console.log('\n⚠️  Cache hit - this poster was already processed');
    } else {
      console.log('\n✅ New job created and queued');
    }
  } catch (error) {
    console.error('❌ Job creation failed:');
    console.error(error);
    process.exit(1);
  }
}

main();

