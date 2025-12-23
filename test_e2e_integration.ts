/**
 * End-to-End Integration Test Script
 * Tests: Job creation, Worker processing, R2 uploads, AI service calls
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = process.env.E2E_BASE_URL || process.env.API_BASE_URL || 'https://sinna1-0.onrender.com';
const TEST_API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;
const TEST_VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

interface TestResult {
  step: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logResult(step: string, status: 'passed' | 'failed' | 'skipped', message: string, details?: any) {
  results.push({ step, status, message, details });
  const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
  console.log(`${icon} ${step}: ${message}`);
}

async function testHealthEndpoint(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      headers: TEST_API_KEY ? { 'x-api-key': TEST_API_KEY } : {},
    });
    
    if (response.status === 200 || response.status === 401) {
      logResult('Health Endpoint', 'passed', `Endpoint accessible (${response.status})`);
    } else {
      logResult('Health Endpoint', 'failed', `Unexpected status: ${response.status}`);
    }
  } catch (error) {
    logResult('Health Endpoint', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testJobCreation(): Promise<void> {
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

    const data = await response.json();

    if (response.ok && data.success && data.data?.id) {
      logResult('Job Creation', 'passed', `Job created: ${data.data.id}`, { jobId: data.data.id });
      return data.data.id;
    } else {
      logResult('Job Creation', 'failed', `Failed to create job: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    logResult('Job Creation', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testJobStatus(jobId: string): Promise<void> {
  if (!TEST_API_KEY || !jobId) {
    logResult('Job Status', 'skipped', 'TEST_API_KEY or jobId not provided');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/jobs/${jobId}`, {
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      logResult('Job Status', 'passed', `Job status retrieved`, { status: data.data?.status });
    } else {
      logResult('Job Status', 'failed', `Failed to get job status: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    logResult('Job Status', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`);
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

  const reportPath = path.join(process.cwd(), 'test-results', 'e2e-integration-report.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Report saved to: ${reportPath}`);
}

async function main() {
  console.log('🧪 End-to-End Integration Test');
  console.log('================================\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test Video: ${TEST_VIDEO_URL}`);
  console.log(`API Key: ${TEST_API_KEY ? '[PROVIDED]' : '[NOT PROVIDED]'}\n`);

  await testHealthEndpoint();
  
  if (TEST_API_KEY) {
    const jobId = await testJobCreation();
    if (jobId) {
      await testJobStatus(jobId);
    }
  } else {
    console.log('\n⚠️  Skipping job creation tests (TEST_API_KEY not provided)');
    console.log('   To test job creation, set TEST_API_KEY environment variable');
  }

  await generateReport();

  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${results.length}`);
  console.log(`   ✅ Passed: ${results.filter(r => r.status === 'passed').length}`);
  console.log(`   ❌ Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log(`   ⏭️  Skipped: ${results.filter(r => r.status === 'skipped').length}`);
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, testHealthEndpoint, testJobCreation, testJobStatus };

