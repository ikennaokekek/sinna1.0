#!/usr/bin/env tsx
/**
 * Test billing endpoints after deployment
 * Verifies /billing/success and /billing/cancel work correctly
 */

import fetch from 'node-fetch';

const BASE_URL_PUBLIC = process.env.BASE_URL_PUBLIC || 'https://sinna.site';

interface TestResult {
  endpoint: string;
  status: number;
  success: boolean;
  message: string;
  data?: any;
}

async function testBillingEndpoints(): Promise<void> {
  console.log('🧪 TESTING BILLING ENDPOINTS');
  console.log('='.repeat(70));
  console.log(`Base URL: ${BASE_URL_PUBLIC}`);
  console.log('');

  const results: TestResult[] = [];

  // Test 1: /billing/success without session_id
  console.log('📋 Test 1: GET /billing/success (no session_id)');
  try {
    const res = await fetch(`${BASE_URL_PUBLIC}/billing/success`);
    const data = await res.json();
    
    results.push({
      endpoint: '/billing/success',
      status: res.status,
      success: res.status === 200 && data.success === true,
      message: res.status === 200 ? '✅ Success' : `❌ Failed (${res.status})`,
      data
    });
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
  } catch (error: any) {
    results.push({
      endpoint: '/billing/success',
      status: 0,
      success: false,
      message: `❌ Error: ${error.message}`
    });
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 2: /billing/success with session_id
  console.log('📋 Test 2: GET /billing/success?session_id=cs_test_123');
  try {
    const res = await fetch(`${BASE_URL_PUBLIC}/billing/success?session_id=cs_test_123`);
    const data = await res.json();
    
    results.push({
      endpoint: '/billing/success?session_id=cs_test_123',
      status: res.status,
      success: res.status === 200 && data.success === true,
      message: res.status === 200 ? '✅ Success' : `❌ Failed (${res.status})`,
      data
    });
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
  } catch (error: any) {
    results.push({
      endpoint: '/billing/success?session_id=cs_test_123',
      status: 0,
      success: false,
      message: `❌ Error: ${error.message}`
    });
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 3: /billing/cancel
  console.log('📋 Test 3: GET /billing/cancel');
  try {
    const res = await fetch(`${BASE_URL_PUBLIC}/billing/cancel`);
    const data = await res.json();
    
    results.push({
      endpoint: '/billing/cancel',
      status: res.status,
      success: res.status === 200 && data.success === false && data.message !== undefined,
      message: res.status === 200 ? '✅ Success' : `❌ Failed (${res.status})`,
      data
    });
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
  } catch (error: any) {
    results.push({
      endpoint: '/billing/cancel',
      status: 0,
      success: false,
      message: `❌ Error: ${error.message}`
    });
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 4: Verify endpoints are public (no auth required)
  console.log('📋 Test 4: Verify endpoints are public (no X-API-Key header)');
  try {
    const res = await fetch(`${BASE_URL_PUBLIC}/billing/success`, {
      headers: {}
    });
    const data = await res.json();
    
    const isPublic = res.status === 200 && !data.code;
    results.push({
      endpoint: '/billing/success (no auth)',
      status: res.status,
      success: isPublic,
      message: isPublic ? '✅ Public (no auth required)' : `❌ Requires auth (${res.status})`,
      data
    });
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Public: ${isPublic ? '✅ Yes' : '❌ No'}`);
    if (!isPublic) {
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    }
  } catch (error: any) {
    results.push({
      endpoint: '/billing/success (no auth)',
      status: 0,
      success: false,
      message: `❌ Error: ${error.message}`
    });
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.endpoint}`);
    console.log(`   ${result.message}`);
    if (result.status) {
      console.log(`   Status: ${result.status}`);
    }
  });
  
  console.log('');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${results.length}`);
  console.log('');
  
  if (failed === 0) {
    console.log('🎉 All billing endpoints are working correctly!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

testBillingEndpoints().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

