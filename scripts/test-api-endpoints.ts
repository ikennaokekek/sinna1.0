#!/usr/bin/env tsx
/**
 * API Endpoint Verification Script
 * Tests all API endpoints to ensure they respond correctly
 */

import fetch from 'node-fetch';
import type { Response } from 'node-fetch';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const API_KEY = process.env.TEST_API_KEY || 'test-key-123';
const TIMEOUT = 10000; // 10 seconds

interface TestResult {
  route: string;
  method: string;
  status: number;
  message: string;
  success: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  method: string,
  path: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    expectedStatus?: number[];
  } = {}
): Promise<TestResult> {
  const url = `${BASE_URL}${path}`;
  const { body, headers = {}, expectedStatus = [200, 201, 401, 403, 404] } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add API key for authenticated endpoints (except public endpoints)
  if (!path.includes('/api-docs') && !path.includes('/metrics') && !path.includes('/v1/demo')) {
    requestHeaders['x-api-key'] = API_KEY;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const status = response.status;
    const isSuccess = expectedStatus.includes(status);

    let message = 'OK';
    if (status === 401) message = 'Unauthorized (expected)';
    if (status === 403) message = 'Forbidden (expected)';
    if (status === 404) message = 'Not Found';
    if (status >= 500) message = 'Server Error';

    return {
      route: path,
      method,
      status,
      message,
      success: isSuccess,
      error: isSuccess ? undefined : `Unexpected status: ${status}`,
    };
  } catch (error: any) {
    const isTimeout = error.name === 'AbortError';
    return {
      route: path,
      method,
      status: 0,
      message: isTimeout ? 'Timeout' : 'Connection Error',
      success: false,
      error: isTimeout ? 'Request timed out' : error.message,
    };
  }
}

async function runTests() {
  console.log(`\n🧪 Testing API endpoints at ${BASE_URL}\n`);
  console.log('=' .repeat(70));

  // Public endpoints
  console.log('\n📋 Public Endpoints');
  results.push(await testEndpoint('GET', '/v1/demo', { expectedStatus: [200] }));
  results.push(await testEndpoint('GET', '/api-docs', { expectedStatus: [200, 301, 302] }));
  results.push(await testEndpoint('GET', '/api-docs/json', { expectedStatus: [200] }));

  // System endpoints (require API key)
  console.log('\n⚙️  System Endpoints');
  results.push(await testEndpoint('GET', '/health', { expectedStatus: [200, 401] }));
  results.push(await testEndpoint('GET', '/readiness', { expectedStatus: [200, 401, 503] }));
  results.push(await testEndpoint('GET', '/metrics', { expectedStatus: [200, 401] }));

  // Jobs endpoints
  console.log('\n📝 Jobs Endpoints');
  results.push(
    await testEndpoint('POST', '/v1/jobs', {
      body: { source_url: 'https://example.com/test.mp4' },
      expectedStatus: [201, 400, 401, 429],
    })
  );
  results.push(await testEndpoint('GET', '/v1/jobs/invalid-id', { expectedStatus: [404, 401] }));

  // Billing endpoints
  console.log('\n💳 Billing Endpoints');
  results.push(await testEndpoint('POST', '/v1/billing/subscribe', { expectedStatus: [200, 401, 503] }));

  // Subscription endpoints
  console.log('\n📊 Subscription Endpoints');
  results.push(await testEndpoint('GET', '/v1/me/subscription', { expectedStatus: [200, 401, 404] }));

  // Usage endpoints
  console.log('\n📈 Usage Endpoints');
  results.push(await testEndpoint('GET', '/v1/me/usage', { expectedStatus: [200, 401] }));

  // Files endpoints
  console.log('\n📁 Files Endpoints');
  results.push(await testEndpoint('GET', '/v1/files/test:sign', { expectedStatus: [200, 400, 401, 404] }));

  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Test Results Summary\n');

  const table: string[] = [];
  table.push('| Route | Method | Status | Message |');
  table.push('|-------|--------|--------|---------|');

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.status > 0 ? result.status.toString() : 'ERR';
    const icon = result.success ? '✅' : '❌';
    table.push(`| ${result.route} | ${result.method} | ${status} | ${icon} ${result.message} |`);
    if (result.success) successCount++;
    else failCount++;
  }

  console.log(table.join('\n'));
  console.log(`\n✅ Passed: ${successCount} | ❌ Failed: ${failCount} | Total: ${results.length}\n`);

  // Detailed failures
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.log('❌ Failed Endpoints:\n');
    for (const failure of failures) {
      console.log(`  ${failure.method} ${failure.route}`);
      console.log(`    Status: ${failure.status}`);
      console.log(`    Error: ${failure.error || failure.message}\n`);
    }
  }

  // Check Swagger JSON
  console.log('\n🔍 Checking Swagger JSON Schema...\n');
  try {
    const swaggerRes = await fetch(`${BASE_URL}/api-docs/json`);
    if (swaggerRes.ok) {
      const swagger = await swaggerRes.json();
      const paths = Object.keys(swagger.paths || {});
      console.log(`✅ Swagger JSON loaded successfully`);
      console.log(`   Found ${paths.length} documented endpoints:`);
      paths.slice(0, 10).forEach((path) => console.log(`     - ${path}`));
      if (paths.length > 10) console.log(`     ... and ${paths.length - 10} more`);
    } else {
      console.log(`❌ Swagger JSON returned status ${swaggerRes.status}`);
    }
  } catch (error: any) {
    console.log(`❌ Failed to fetch Swagger JSON: ${error.message}`);
  }

  // Exit code
  process.exit(failures.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});

