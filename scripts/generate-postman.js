#!/usr/bin/env node

/**
 * Generate Postman Collection from Swagger/OpenAPI spec
 * This script can be run to auto-generate updated Postman collections
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  baseUrl: process.env.BASE_URL || 'https://your-app.onrender.com',
  version: '1.0.0',
  outputDir: path.join(__dirname, '..', 'postman')
};

/**
 * Generate comprehensive Postman collection
 */
function generatePostmanCollection() {
  console.log('🚀 Generating Postman collection...');

  const collection = {
    info: {
      name: 'Sinna API - Complete Collection',
      description: 'Auto-generated comprehensive API collection for Sinna accessibility features',
      version: config.version,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    auth: {
      type: 'apikey',
      apikey: [
        { key: 'key', value: 'x-api-key', type: 'string' },
        { key: 'value', value: '{{API_KEY}}', type: 'string' },
        { key: 'in', value: 'header', type: 'string' }
      ]
    },
    variable: [
      { key: 'BASE_URL', value: config.baseUrl, type: 'string' },
      { key: 'API_KEY', value: 'sk_test_your_api_key_here', type: 'string' },
      { key: 'JOB_ID', value: '', type: 'string' },
      { key: 'FILE_KEY', value: '', type: 'string' }
    ],
    item: generateCollectionItems()
  };

  // Write collection file
  const collectionPath = path.join(config.outputDir, 'Generated-Sinna-API.postman_collection.json');
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
  
  console.log(`✅ Collection generated: ${collectionPath}`);
  return collectionPath;
}

/**
 * Generate all collection items/folders
 */
function generateCollectionItems() {
  return [
    generateHealthFolder(),
    generateAudioServicesFolder(),
    generateAccessibilityFolder(),
    generateJobsFolder(),
    generateStorageFolder(),
    generateBillingFolder(),
    generateTestingFolder()
  ];
}

/**
 * Generate health and monitoring endpoints
 */
function generateHealthFolder() {
  return {
    name: '🏥 Health & Monitoring',
    description: 'System health checks and monitoring endpoints',
    item: [
      {
        name: 'Health Check (Public)',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/health', host: ['{{BASE_URL}}'], path: ['health'] },
          description: 'Comprehensive system health check - no auth required'
        },
        response: []
      },
      {
        name: 'Ping (Public)',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/ping', host: ['{{BASE_URL}}'], path: ['ping'] },
          description: 'Simple uptime check - no auth required'
        },
        response: []
      },
      {
        name: 'Prometheus Metrics (Public)',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/metrics', host: ['{{BASE_URL}}'], path: ['metrics'] },
          description: 'Prometheus metrics for monitoring - no auth required'
        },
        response: []
      },
      {
        name: 'System Information',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/monitoring/system', host: ['{{BASE_URL}}'], path: ['v1', 'monitoring', 'system'] },
          description: 'Detailed system information - requires auth'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate audio services endpoints
 */
function generateAudioServicesFolder() {
  return {
    name: '🎵 Audio Services',
    description: 'Speech-to-text, text-to-speech, and audio description services',
    item: [
      {
        name: 'Transcribe Audio (Sync)',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              audioUrl: 'https://example.com/sample-audio.mp3',
              language: 'en',
              includeWordTimestamps: true,
              includeSpeakerLabels: false,
              provider: 'auto'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/audio/transcribe', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'transcribe'] },
          description: 'Synchronous audio transcription with word timestamps'
        },
        response: []
      },
      {
        name: 'Generate Subtitles',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              audioUrl: 'https://example.com/video-audio.mp3',
              language: 'en',
              format: 'vtt',
              includeWordTimestamps: true,
              webhookUrl: 'https://your-app.com/webhook/subtitles'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/audio/generate-subtitles', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'generate-subtitles'] },
          description: 'Generate subtitle files in VTT, SRT, or ASS format'
        },
        response: []
      },
      {
        name: 'Text to Speech',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              text: 'Welcome to Sinna API. This text will be converted to speech using advanced AI.',
              voice: 'nova',
              speed: 1.0,
              format: 'mp3',
              quality: 'high',
              provider: 'openai'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/audio/text-to-speech', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'text-to-speech'] },
          description: 'Convert text to speech with customizable voice and quality'
        },
        response: []
      },
      {
        name: 'Generate Audio Descriptions',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              descriptions: [
                { time: 5.0, text: 'The scene opens with a panoramic view of a bustling city skyline' },
                { time: 15.5, text: 'A woman in professional attire walks confidently across the street' },
                { time: 30.2, text: 'The camera focuses on her determined expression as she approaches the building' },
                { time: 45.0, text: 'She enters through the glass revolving doors of the modern office complex' }
              ],
              voice: 'nova',
              speed: 0.9,
              format: 'mp3',
              quality: 'high'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/audio/audio-description', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'audio-description'] },
          description: 'Generate timed audio descriptions for video accessibility'
        },
        response: []
      },
      {
        name: 'Get Available Voices',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/audio/voices', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'voices'] },
          description: 'List all available TTS voices across providers'
        },
        response: []
      },
      {
        name: 'Audio Services Health Check',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/audio/health', host: ['{{BASE_URL}}'], path: ['v1', 'audio', 'health'] },
          description: 'Check health status of STT and TTS services'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate accessibility analysis endpoints
 */
function generateAccessibilityFolder() {
  return {
    name: '♿ Accessibility Analysis',
    description: 'Color analysis and accessibility compliance checking',
    item: [
      {
        name: 'Analyze Video Colors',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              videoUrl: 'https://example.com/sample-video.mp4',
              frameCount: 8,
              startTime: 10,
              interval: 30,
              webhookUrl: 'https://your-app.com/webhook/color-analysis'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/accessibility/color-analysis', host: ['{{BASE_URL}}'], path: ['v1', 'accessibility', 'color-analysis'] },
          description: 'Analyze video colors for WCAG compliance and accessibility'
        },
        response: []
      },
      {
        name: 'Comprehensive Accessibility Audit',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              videoUrl: 'https://example.com/content-video.mp4',
              checkContrast: true,
              checkColorBlindness: true,
              checkMotionSensitivity: true,
              webhookUrl: 'https://your-app.com/webhook/accessibility-audit'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/accessibility/audit', host: ['{{BASE_URL}}'], path: ['v1', 'accessibility', 'audit'] },
          description: 'Complete accessibility audit with multiple checks'
        },
        response: []
      },
      {
        name: 'Get WCAG Guidelines',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/accessibility/guidelines', host: ['{{BASE_URL}}'], path: ['v1', 'accessibility', 'guidelines'] },
          description: 'Get WCAG 2.1 guidelines and best practices for accessibility'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate job management endpoints
 */
function generateJobsFolder() {
  return {
    name: '⚙️ Job Management',
    description: 'Background job management and queue monitoring',
    item: [
      {
        name: 'Queue Subtitle Generation Job',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              videoUrl: 'https://example.com/long-video.mp4',
              language: 'en',
              format: 'vtt',
              webhookUrl: 'https://your-app.com/webhook/job-complete'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/jobs/subtitles', host: ['{{BASE_URL}}'], path: ['v1', 'jobs', 'subtitles'] },
          description: 'Queue a subtitle generation job for async processing'
        },
        response: []
      },
      {
        name: 'Queue Color Analysis Job',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              videoUrl: 'https://example.com/video-for-analysis.mp4',
              webhookUrl: 'https://your-app.com/webhook/color-complete'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/jobs/color-analysis', host: ['{{BASE_URL}}'], path: ['v1', 'jobs', 'color-analysis'] },
          description: 'Queue a color analysis job for background processing'
        },
        response: []
      },
      {
        name: 'Get Job Status',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/jobs/subtitle-generation/{{JOB_ID}}', host: ['{{BASE_URL}}'], path: ['v1', 'jobs', 'subtitle-generation', '{{JOB_ID}}'] },
          description: 'Check status of a specific job by queue name and job ID'
        },
        response: []
      },
      {
        name: 'Get All Queue Statistics',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/jobs/stats', host: ['{{BASE_URL}}'], path: ['v1', 'jobs', 'stats'] },
          description: 'Get statistics for all job queues and processing status'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate storage management endpoints
 */
function generateStorageFolder() {
  return {
    name: '📁 Storage Management',
    description: 'File storage and signed URL management with Cloudflare R2',
    item: [
      {
        name: 'Generate Upload URL for Subtitles',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              fileName: 'episode-01-subtitles.vtt',
              contentType: 'text/vtt',
              folder: 'subtitles',
              language: 'en',
              format: 'vtt'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/storage/upload-url', host: ['{{BASE_URL}}'], path: ['v1', 'storage', 'upload-url'] },
          description: 'Generate signed URL for uploading subtitle files'
        },
        response: []
      },
      {
        name: 'Generate Upload URL for Audio',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              fileName: 'audio-description.mp3',
              contentType: 'audio/mpeg',
              folder: 'audio',
              language: 'en'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/storage/upload-url', host: ['{{BASE_URL}}'], path: ['v1', 'storage', 'upload-url'] },
          description: 'Generate signed URL for uploading audio description files'
        },
        response: []
      },
      {
        name: 'Get Download URL',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              key: 'subtitles/tenant123/1234567890-episode-01-subtitles.vtt',
              expiresIn: 7200
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/storage/download-url', host: ['{{BASE_URL}}'], path: ['v1', 'storage', 'download-url'] },
          description: 'Generate signed URL for downloading files from storage'
        },
        response: []
      },
      {
        name: 'Delete File',
        request: {
          method: 'DELETE',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/storage/{{FILE_KEY}}', host: ['{{BASE_URL}}'], path: ['v1', 'storage', '{{FILE_KEY}}'] },
          description: 'Delete a file from storage (URL encode the file key)'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate billing and subscription endpoints
 */
function generateBillingFolder() {
  return {
    name: '💳 Billing & Subscriptions',
    description: 'Subscription management and billing operations',
    item: [
      {
        name: 'Get Subscription Plans',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/billing/plans', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'plans'] },
          description: 'Get available subscription plans (Standard $1500, Gold $3000)'
        },
        response: []
      },
      {
        name: 'Create Stripe Customer',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: 'customer@streamingplatform.com',
              name: 'Streaming Platform Inc',
              metadata: {
                company: 'Streaming Platform Inc',
                industry: 'Media & Entertainment'
              }
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/billing/customer', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'customer'] },
          description: 'Create a new Stripe customer for billing'
        },
        response: []
      },
      {
        name: 'Create Checkout Session (Standard Plan)',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              planId: 'standard',
              successUrl: 'https://your-streaming-platform.com/billing/success',
              cancelUrl: 'https://your-streaming-platform.com/billing/cancel'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/billing/checkout', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'checkout'] },
          description: 'Create Stripe checkout session for Standard plan ($1500/month)'
        },
        response: []
      },
      {
        name: 'Create Checkout Session (Gold Plan)',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              planId: 'gold',
              successUrl: 'https://your-streaming-platform.com/billing/success',
              cancelUrl: 'https://your-streaming-platform.com/billing/cancel'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/billing/checkout', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'checkout'] },
          description: 'Create Stripe checkout session for Gold plan ($3000/month)'
        },
        response: []
      },
      {
        name: 'Get Subscription Status & Usage',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/billing/subscription', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'subscription'] },
          description: 'Get current subscription status, plan details, and usage statistics'
        },
        response: []
      },
      {
        name: 'Create Customer Portal Session',
        request: {
          method: 'POST',
          header: [],
          url: { raw: '{{BASE_URL}}/v1/billing/portal', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'portal'] },
          description: 'Create Stripe customer portal session for self-service billing'
        },
        response: []
      },
      {
        name: 'Cancel Subscription (End of Period)',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              immediately: false
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/billing/cancel', host: ['{{BASE_URL}}'], path: ['v1', 'billing', 'cancel'] },
          description: 'Cancel subscription at the end of current billing period'
        },
        response: []
      },
      {
        name: 'Get Billing History',
        request: {
          method: 'GET',
          header: [],
          url: { 
            raw: '{{BASE_URL}}/v1/billing/history?limit=25', 
            host: ['{{BASE_URL}}'], 
            path: ['v1', 'billing', 'history'],
            query: [{ key: 'limit', value: '25' }]
          },
          description: 'Get billing history and invoice downloads'
        },
        response: []
      }
    ]
  };
}

/**
 * Generate testing and demo endpoints
 */
function generateTestingFolder() {
  return {
    name: '🧪 Testing & Demo',
    description: 'Testing utilities and demo endpoints',
    item: [
      {
        name: 'Test Error Reporting (Dev Only)',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              type: 'validation',
              message: 'Testing Sentry error reporting integration'
            }, null, 2)
          },
          url: { raw: '{{BASE_URL}}/v1/monitoring/test-error', host: ['{{BASE_URL}}'], path: ['v1', 'monitoring', 'test-error'] },
          description: 'Test error reporting and Sentry integration (development only)'
        },
        response: []
      },
      {
        name: 'API Root Information',
        request: {
          method: 'GET',
          header: [],
          url: { raw: '{{BASE_URL}}/', host: ['{{BASE_URL}}'], path: [''] },
          description: 'Get API information and available endpoints'
        },
        response: []
      }
    ]
  };
}

// Run the generator if called directly
if (require.main === module) {
  try {
    // Ensure output directory exists
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    const collectionPath = generatePostmanCollection();
    
    console.log('\n🎉 Postman collection generated successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Import the collection into Postman');
    console.log('2. Import the environment file');
    console.log('3. Update BASE_URL and API_KEY variables');
    console.log('4. Start testing your API!');
    console.log('\n📁 Files generated:');
    console.log(`   Collection: ${collectionPath}`);
    console.log(`   Environment: ${path.join(config.outputDir, 'Sinna-API.postman_environment.json')}`);
    
  } catch (error) {
    console.error('❌ Error generating Postman collection:', error.message);
    process.exit(1);
  }
}

module.exports = { generatePostmanCollection };
