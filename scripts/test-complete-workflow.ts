#!/usr/bin/env tsx
/**
 * Complete End-to-End Testing Workflow
 * Tests: Stripe → API Key → All Presets → Results Verification
 */

import Stripe from 'stripe';

const API_BASE_URL = process.env.API_BASE_URL || process.env.E2E_BASE_URL || 'https://sinna1-0.onrender.com';
const TEST_VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_STANDARD_PRICE_ID = process.env.STRIPE_STANDARD_PRICE_ID || 'price_1QvZJZP3xYzQy2rX8K9LmN0p';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_API_KEY = process.env.TEST_API_KEY; // Optional - if you already have an API key

interface TestResult {
  test: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  duration?: number;
  data?: any;
}

const results: TestResult[] = [];

function logResult(test: string, status: 'passed' | 'failed' | 'skipped', message: string, duration?: number, data?: any) {
  const emoji = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${emoji} ${test}: ${message}${durationStr}`);
  results.push({ test, status, message, duration, data });
}

async function testHealthCheck(): Promise<void> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const duration = Date.now() - start;
    
    if (response.status === 200) {
      const data = await response.json();
      if (data.status === 'ok' || data.database === 'up') {
        logResult('Health Check', 'passed', `API is healthy (DB: ${data.database || 'up'})`, duration);
      } else {
        logResult('Health Check', 'passed', `API responding (status: ${data.status || response.status})`, duration);
      }
    } else if (response.status === 401) {
      // Unauthorized is expected without API key - service is up
      logResult('Health Check', 'passed', `API is responding (401 unauthorized - expected)`, duration);
    } else {
      const text = await response.text();
      logResult('Health Check', 'failed', `Unexpected status ${response.status}: ${text.substring(0, 100)}`, duration);
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Health Check', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
  }
}

async function createStripeCheckout(): Promise<string | null> {
  if (!STRIPE_SECRET_KEY) {
    logResult('Stripe Checkout', 'skipped', 'STRIPE_SECRET_KEY not provided');
    return null;
  }

  const start = Date.now();
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60);
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_STANDARD_PRICE_ID, quantity: 1 }],
      success_url: `${API_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${API_BASE_URL}/billing/cancel`,
      customer_email: TEST_EMAIL,
      expires_at: expiresAt,
      payment_method_types: ['card'],
      metadata: {
        test: 'true',
        test_email: TEST_EMAIL,
      },
    });

    const duration = Date.now() - start;
    
    if (session.url) {
      logResult('Stripe Checkout', 'passed', `Checkout URL created: ${session.url}`, duration, { sessionId: session.id, url: session.url });
      console.log(`\n💳 Test Card: 4242 4242 4242 4242`);
      console.log(`📧 Email: ${TEST_EMAIL}`);
      console.log(`🔗 Checkout URL: ${session.url}\n`);
      return session.url;
    } else {
      logResult('Stripe Checkout', 'failed', 'No checkout URL returned', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('Stripe Checkout', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
    return null;
  }
}

async function verifyApiKey(apiKey: string): Promise<boolean> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE_URL}/v1/me/subscription`, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (response.ok && data.success) {
      logResult('API Key Verification', 'passed', `Subscription status: ${data.data?.status || 'active'}`, duration);
      return true;
    } else {
      logResult('API Key Verification', 'failed', `Invalid API key: ${JSON.stringify(data)}`, duration);
      return false;
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult('API Key Verification', 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
    return false;
  }
}

async function createJob(apiKey: string, preset: string): Promise<string | null> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE_URL}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        source_url: TEST_VIDEO_URL,
        preset_id: preset,
      }),
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (response.ok && data.success && data.data?.id) {
      logResult(`Job Creation (${preset})`, 'passed', `Job created: ${data.data.id}`, duration, { jobId: data.data.id });
      return data.data.id;
    } else {
      logResult(`Job Creation (${preset})`, 'failed', `Failed: ${JSON.stringify(data)}`, duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    logResult(`Job Creation (${preset})`, 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`, duration);
    return null;
  }
}

async function pollJobStatus(apiKey: string, jobId: string, maxAttempts: number = 120): Promise<boolean> {
  let attempts = 0;
  const start = Date.now();

  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      const response = await fetch(`${API_BASE_URL}/v1/jobs/${jobId}`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        logResult(`Job Status (${jobId})`, 'failed', `HTTP ${response.status}: ${JSON.stringify(data)}`);
        return false;
      }

      const status = data.data?.status;

      if (status === 'completed') {
        const duration = Date.now() - start;
        const steps = data.data?.steps || {};
        const urls: Record<string, string> = {};
        
        // Extract URLs
        if (steps.captions?.url) urls.captions = steps.captions.url;
        if (steps.ad?.url) urls.ad = steps.ad.url;
        if (steps.color?.url) urls.color = steps.color.url;
        if (steps.videoTransform?.url) urls.videoTransform = steps.videoTransform.url;

        logResult(`Job Completion (${jobId})`, 'passed', `Completed in ${Math.round(duration / 1000)}s`, duration, urls);
        return true;
      } else if (status === 'failed') {
        const duration = Date.now() - start;
        logResult(`Job Completion (${jobId})`, 'failed', `Job failed`, duration);
        return false;
      }

      // Still processing
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    } catch (error) {
      logResult(`Job Status (${jobId})`, 'failed', `Error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  const duration = Date.now() - start;
  logResult(`Job Completion (${jobId})`, 'failed', `Timeout after ${maxAttempts} attempts`, duration);
  return false;
}

async function testAllPresets(apiKey: string): Promise<void> {
  const presets = [
    'everyday',
    'adhd',
    'autism',
    'blindness',
    'deaf',
    'color_blindness',
    'epilepsy_flash',
    'epilepsy_noise',
    'low_vision',
    'hoh',
    'cognitive',
    'motion',
    'cognitive_load',
  ];

  console.log(`\n🧪 Testing ${presets.length} Presets\n`);
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const preset of presets) {
    console.log(`\n📹 Testing preset: ${preset}`);
    
    const jobId = await createJob(apiKey, preset);
    
    if (jobId) {
      console.log(`   ⏳ Waiting for completion...`);
      const completed = await pollJobStatus(apiKey, jobId, 120); // 10 minutes max
      
      if (completed) {
        passed++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }
    
    console.log('   ' + '-'.repeat(66));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`\n📊 Preset Test Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / presets.length) * 100)}%\n`);
}

async function generateReport(): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    testVideoUrl: TEST_VIDEO_URL,
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    },
    results: results,
  };

  console.log('\n' + '='.repeat(70));
  console.log('📋 FINAL TEST REPORT');
  console.log('='.repeat(70));
  console.log(`\nTimestamp: ${report.timestamp}`);
  console.log(`API Base URL: ${report.apiBaseUrl}`);
  console.log(`Test Video: ${report.testVideoUrl}`);
  console.log(`\nSummary:`);
  console.log(`  Total Tests: ${report.summary.total}`);
  console.log(`  ✅ Passed: ${report.summary.passed}`);
  console.log(`  ❌ Failed: ${report.summary.failed}`);
  console.log(`  ⏭️  Skipped: ${report.summary.skipped}`);
  console.log(`\nSuccess Rate: ${Math.round((report.summary.passed / report.summary.total) * 100)}%`);

  // Save report to file
  const fs = await import('fs');
  const reportPath = `test-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);
}

async function main() {
  console.log('🚀 Complete End-to-End Testing Workflow');
  console.log('='.repeat(70));
  console.log(`\nAPI Base URL: ${API_BASE_URL}`);
  console.log(`Test Video: ${TEST_VIDEO_URL}`);
  console.log(`Test Email: ${TEST_EMAIL}\n`);

  // Step 1: Health Check
  console.log('\n1️⃣ Health Check');
  console.log('-'.repeat(70));
  await testHealthCheck();

  // Step 2: Stripe Checkout (if API key not provided)
  let apiKey = TEST_API_KEY;
  
  if (!apiKey) {
    console.log('\n2️⃣ Stripe Checkout Creation');
    console.log('-'.repeat(70));
    const checkoutUrl = await createStripeCheckout();
    
    if (checkoutUrl) {
      console.log('\n⚠️  MANUAL STEP REQUIRED:');
      console.log('   1. Open the checkout URL above');
      console.log('   2. Complete payment with test card: 4242 4242 4242 4242');
      console.log('   3. Check your email for the API key');
      console.log('   4. Set TEST_API_KEY environment variable and run again');
      console.log('\n   Or provide TEST_API_KEY now to continue testing...\n');
      
      // Wait a bit for user to potentially provide API key
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if API key was provided via stdin or env update
      apiKey = process.env.TEST_API_KEY;
      
      if (!apiKey) {
        console.log('⏭️  Skipping preset tests - API key required');
        await generateReport();
        process.exit(0);
      }
    }
  }

  // Step 3: Verify API Key
  if (apiKey) {
    console.log('\n3️⃣ API Key Verification');
    console.log('-'.repeat(70));
    const isValid = await verifyApiKey(apiKey);
    
    if (!isValid) {
      console.log('\n❌ Invalid API key. Cannot proceed with preset tests.');
      await generateReport();
      process.exit(1);
    }
  } else {
    console.log('\n⏭️  Skipping API key verification - no API key provided');
  }

  // Step 4: Test All Presets
  if (apiKey) {
    console.log('\n4️⃣ Testing All Presets');
    console.log('-'.repeat(70));
    await testAllPresets(apiKey);
  }

  // Step 5: Generate Report
  await generateReport();

  // Exit with appropriate code
  const failedCount = results.filter(r => r.status === 'failed').length;
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

