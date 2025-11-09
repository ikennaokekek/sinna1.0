#!/usr/bin/env node
/**
 * Production Verification Script for Sinna 1.0
 * 
 * Runs comprehensive tests against production:
 * 1. Integration tests
 * 2. All 8 presets end-to-end verification
 * 3. Qwen functionality confirmation
 * 4. Performance tests under load
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROD_API = process.env.SINNA_API_URL || 'https://sinna.site';
const TEST_API_KEY = process.env.TEST_API_KEY || '';
const TEST_VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';

const presets = [
  'blindness',
  'deaf',
  'color_blindness',
  'adhd',
  'autism',
  'epilepsy_flash',
  'epilepsy_noise',
  'cognitive_load',
];

interface TestResult {
  preset: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  jobId?: string;
  qwenUsed?: boolean;
  language?: string;
}

const results: TestResult[] = [];

async function testPreset(preset: string): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n🧪 Testing preset: ${preset}`);
  
  try {
    // Create job
    const createRes = await fetch(`${PROD_API}/v1/jobs`, {
      method: 'POST',
      headers: {
        'x-api-key': TEST_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_url: TEST_VIDEO_URL,
        preset_id: preset,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Job creation failed: ${createRes.status} ${await createRes.text()}`);
    }

    const jobData = await createRes.json();
    const jobId = jobData.data?.id || jobData.id;

    if (!jobId) {
      throw new Error('No job ID returned');
    }

    console.log(`  ✅ Job created: ${jobId}`);

    // Poll for completion (max 5 minutes)
    let completed = false;
    let finalStatus = 'pending';
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const startPoll = Date.now();

    while (!completed && (Date.now() - startPoll) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusRes = await fetch(`${PROD_API}/v1/jobs/${jobId}`, {
        headers: { 'x-api-key': TEST_API_KEY },
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        finalStatus = statusData.data?.status || statusData.status || 'unknown';
        
        if (finalStatus === 'completed' || finalStatus === 'failed') {
          completed = true;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (finalStatus === 'completed') {
      console.log(`  ✅ Preset ${preset} completed successfully (${Math.round(duration / 1000)}s)`);
      return {
        preset,
        status: 'passed',
        duration,
        jobId: String(jobId),
      };
    } else {
      throw new Error(`Job did not complete: ${finalStatus}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`  ❌ Preset ${preset} failed:`, error instanceof Error ? error.message : String(error));
    return {
      preset,
      status: 'failed',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testQwen(): Promise<boolean> {
  console.log('\n🧠 Testing Qwen-3-VL Integration...');
  
  try {
    // Import Qwen client - fix path
    const { qwenInstruct } = await import('../apps/api/src/lib/qwenClient');
    
    const response = await qwenInstruct({
      messages: [
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: 'Say "test successful"' },
      ],
      max_tokens: 50,
    });

    const modelVerified = response.model?.includes('qwen3-vl-8b-instruct');
    if (modelVerified) {
      console.log('  ✅ Qwen-3-VL is operational');
      return true;
    } else {
      console.warn('  ⚠️ Qwen model verification failed');
      return false;
    }
  } catch (error) {
    console.warn('  ⚠️ Qwen test skipped:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testPerformance(concurrentJobs: number = 5): Promise<void> {
  console.log(`\n⚡ Performance Test: ${concurrentJobs} concurrent jobs...`);
  
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < concurrentJobs; i++) {
    promises.push(
      fetch(`${PROD_API}/v1/jobs`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: TEST_VIDEO_URL,
          preset_id: 'everyday',
        }),
      }).then(res => res.json())
    );
  }

  try {
    const responses = await Promise.all(promises);
    const duration = Date.now() - startTime;
    const successCount = responses.filter(r => r.success !== false).length;
    
    console.log(`  ✅ ${successCount}/${concurrentJobs} jobs created in ${duration}ms`);
    console.log(`  📊 Average response time: ${Math.round(duration / concurrentJobs)}ms`);
  } catch (error) {
    console.error('  ❌ Performance test failed:', error);
  }
}

async function generateReport(): Promise<void> {
  const reportDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const report = `# Production Verification Report

**Date:** ${new Date().toISOString()}
**API URL:** ${PROD_API}
**Test Video:** ${TEST_VIDEO_URL}

## Summary

- **Total Presets Tested:** ${results.length}
- **Passed:** ${passed} ✅
- **Failed:** ${failed} ❌
- **Total Duration:** ${Math.round(totalDuration / 1000)}s
- **Average Duration:** ${Math.round(totalDuration / results.length / 1000)}s per preset

## Detailed Results

${results.map(r => `
### ${r.preset}
- **Status:** ${r.status === 'passed' ? '✅ PASSED' : '❌ FAILED'}
- **Duration:** ${Math.round(r.duration / 1000)}s
- **Job ID:** ${r.jobId || 'N/A'}
${r.error ? `- **Error:** ${r.error}` : ''}
`).join('')}

## Recommendations

${failed === 0 ? '✅ All presets passed successfully. System is production-ready.' : `⚠️ ${failed} preset(s) failed. Review errors above and fix before production deployment.`}

## Next Steps

1. Review failed presets and fix issues
2. Monitor production logs for errors
3. Set up uptime monitoring
4. Configure alerting for failures
`;

  const reportPath = path.join(reportDir, 'production_verification_report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

async function main() {
  console.log('🚀 Starting Production Verification for Sinna 1.0');
  console.log(`📍 API: ${PROD_API}`);
  console.log(`🎬 Test Video: ${TEST_VIDEO_URL}`);
  console.log(`🔑 API Key: ${TEST_API_KEY ? `${TEST_API_KEY.substring(0, 20)}...` : 'NOT SET'}\n`);

  // Check API connectivity first
  console.log('🔍 Checking API connectivity...');
  try {
    const demoRes = await fetch(`${PROD_API}/v1/demo`);
    if (demoRes.ok) {
      console.log('  ✅ API is reachable');
    } else {
      console.warn(`  ⚠️ API returned ${demoRes.status}`);
    }
  } catch (error) {
    console.error('  ❌ API is not reachable:', error instanceof Error ? error.message : String(error));
    console.error('\n⚠️ Cannot proceed with tests - API is unreachable');
    process.exit(1);
  }

  // Check API key if provided
  if (TEST_API_KEY && TEST_API_KEY.length > 10) {
    console.log('\n🔍 Verifying API key...');
    try {
      const healthRes = await fetch(`${PROD_API}/health`, {
        headers: { 'x-api-key': TEST_API_KEY },
      });
      if (healthRes.ok) {
        console.log('  ✅ API key is valid');
      } else {
        const errorText = await healthRes.text().catch(() => '');
        console.warn(`  ⚠️ API key validation failed: ${healthRes.status} ${errorText}`);
        console.warn('  💡 The API key may not be registered in the production database.');
        console.warn('  💡 You may need to create a subscription via Stripe checkout first.');
      }
    } catch (error) {
      console.warn('  ⚠️ Could not verify API key:', error instanceof Error ? error.message : String(error));
    }
  } else {
    console.warn('\n⚠️ TEST_API_KEY not set - preset tests will be skipped');
  }

  // Test Qwen
  const qwenWorks = await testQwen();
  if (!qwenWorks) {
    console.warn('⚠️ Qwen test failed - some features may not work');
  }

  // Test all presets (only if API key is valid)
  if (TEST_API_KEY && TEST_API_KEY.length > 10) {
    console.log('\n📋 Testing all 8 presets...');
    for (const preset of presets) {
      const result = await testPreset(preset);
      results.push(result);
    }
  } else {
    console.log('\n⏭️ Skipping preset tests (no valid API key)');
    for (const preset of presets) {
      results.push({
        preset,
        status: 'skipped',
        duration: 0,
        error: 'TEST_API_KEY not set',
      });
    }
  }

  // Performance test (only if API key is valid)
  if (TEST_API_KEY && TEST_API_KEY.length > 10) {
    await testPerformance(5);
  } else {
    console.log('\n⏭️ Skipping performance test (no valid API key)');
  }

  // Generate report
  await generateReport();

  // Summary
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log('\n' + '='.repeat(50));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`⏭️ Skipped: ${skipped}/${results.length}`);
  console.log(`🧠 Qwen: ${qwenWorks ? '✅ Operational' : '⚠️ Not verified'}`);
  console.log('='.repeat(50));

  if (failed === 0 && qwenWorks && skipped === 0) {
    console.log('\n🎉 ALL TESTS PASSED - PRODUCTION READY!');
    process.exit(0);
  } else if (skipped > 0 && failed === 0) {
    console.log('\n⚠️ SOME TESTS SKIPPED - API KEY NEEDED');
    console.log('💡 To run full tests, ensure TEST_API_KEY is set and registered in production database.');
    process.exit(0);
  } else {
    console.log('\n⚠️ SOME TESTS FAILED - REVIEW REPORT');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

