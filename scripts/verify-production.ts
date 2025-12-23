#!/usr/bin/env tsx
/**
 * Production Verification Script
 * Tests all critical endpoints and functionality
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = process.env.E2E_BASE_URL || process.env.API_BASE_URL || 'https://sinna1-0.onrender.com';
const TEST_API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;
const TEST_VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

interface TestResult {
  test: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  duration?: number;
  details?: any;
}

const results: TestResult[] = [];

function logResult(test: string, status: 'passed' | 'failed' | 'skipped', message: string, duration?: number, details?: any) {
  results.push({ test, status, message, duration, details });
  const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${icon} ${test}: ${message}${durationStr}`);
}

async function testHealthEndpoint(): Promise<void> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const duration = Date.now() - start;
    
    if (response.status === 200) {
      const data = await response.json();
      logResult('Health Endpoint', 'passed', `Endpoint accessible`, duration, data);
    } else {
      logResult('Health Endpoint', 'failed', `Unexpected status: ${response.status}`, duration);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Health Endpoint', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
  }
}

async function testDatabaseHealth(): Promise<void> {
  const start = Date.now();
  if (!TEST_API_KEY) {
    logResult('Database Health', 'skipped', 'TEST_API_KEY not provided');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const duration = Date.now() - start;
    const data = await response.json();
    
    if (response.status === 200 && data.db === 'up') {
      logResult('Database Health', 'passed', 'Database connection healthy', duration, data);
    } else {
      logResult('Database Health', 'failed', `Database unhealthy: ${JSON.stringify(data)}`, duration);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Database Health', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
  }
}

async function testJobCreation(): Promise<void> {
  const start = Date.now();
  if (!TEST_API_KEY) {
    logResult('Job Creation', 'skipped', 'TEST_API_KEY not provided');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({
        source_url: TEST_VIDEO_URL,
        preset_id: 'everyday',
      }),
    });

    const duration = Date.now() - start;
    const data = await response.json();

    if (response.ok && data.success && data.data?.id) {
      logResult('Job Creation', 'passed', `Job created: ${data.data.id}`, duration, { jobId: data.data.id });
      return data.data.id;
    } else {
      logResult('Job Creation', 'failed', `Failed: ${JSON.stringify(data)}`, duration);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Job Creation', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
  }
}

async function testJobStatus(jobId: string): Promise<void> {
  const start = Date.now();
  if (!TEST_API_KEY || !jobId) {
    logResult('Job Status', 'skipped', 'TEST_API_KEY or jobId not provided');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/jobs/${jobId}`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });

    const duration = Date.now() - start;
    const data = await response.json();

    if (response.ok && data.success) {
      logResult('Job Status', 'passed', `Status retrieved: ${data.data?.status}`, duration, { status: data.data?.status });
    } else {
      logResult('Job Status', 'failed', `Failed: ${JSON.stringify(data)}`, duration);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Job Status', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
  }
}

async function testAllPresets(): Promise<void> {
  if (!TEST_API_KEY) {
    logResult('All Presets', 'skipped', 'TEST_API_KEY not provided');
    return;
  }

  const presets = ['everyday', 'adhd', 'autism', 'blindness', 'deaf', 'color_blindness'];
  let passed = 0;
  let failed = 0;

  for (const preset of presets) {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY,
        },
        body: JSON.stringify({
          source_url: TEST_VIDEO_URL,
          preset_id: preset,
        }),
      });

      if (response.ok) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
    }
  }

  if (failed === 0) {
    logResult('All Presets', 'passed', `${passed} presets tested successfully`);
  } else {
    logResult('All Presets', 'failed', `${failed} presets failed out of ${presets.length}`);
  }
}

async function generateReport(): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    testVideoUrl: TEST_VIDEO_URL,
    hasApiKey: !!TEST_API_KEY,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    },
  };

  const reportPath = path.join(process.cwd(), 'test-results', 'production-verification-report.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Report saved to: ${reportPath}`);
}

async function main() {
  console.log('🧪 Production Verification Test');
  console.log('================================\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test Video: ${TEST_VIDEO_URL}`);
  console.log(`API Key: ${TEST_API_KEY ? '[PROVIDED]' : '[NOT PROVIDED]'}\n`);

  await testHealthEndpoint();
  await testDatabaseHealth();
  
  if (TEST_API_KEY) {
    const jobId = await testJobCreation();
    if (jobId) {
      await testJobStatus(jobId);
    }
    await testAllPresets();
  } else {
    console.log('\n⚠️  Skipping API key tests (TEST_API_KEY not provided)');
  }

  await generateReport();

  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${results.length}`);
  console.log(`   ✅ Passed: ${results.filter(r => r.status === 'passed').length}`);
  console.log(`   ❌ Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log(`   ⏭️  Skipped: ${results.filter(r => r.status === 'skipped').length}`);
  
  const allPassed = results.filter(r => r.status === 'failed').length === 0;
  if (allPassed) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, testHealthEndpoint, testDatabaseHealth, testJobCreation, testJobStatus };
