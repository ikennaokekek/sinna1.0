import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Sinna Watchdog - Automated Log Monitoring & Auto-Healing
 * 
 * Monitors Render logs for critical errors and triggers auto-healing tests
 * when issues are detected.
 * 
 * Usage:
 *   RENDER_SERVICE_ID=<service-id> RENDER_API_KEY=<api-key> pnpm tsx scripts/watchdog.ts
 */

// Accept multiple env var names and provide a safe default for convenience
const RENDER_SERVICE_ID =
  process.env.RENDER_SERVICE_ID ||
  (process.env as any).render_service_id ||
  process.env.RENDER_API_SERVICE_ID ||
  process.env.RENDER_SERVICE ||
  'srv-d3sqcsi4d50c73ej1kug';
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes
const LOG_LIMIT = 200; // Number of log lines to fetch

// Error patterns to detect (matching actual error messages in codebase)
const ALERT_WORDS = [
  // Queue/Worker failures
  'captions.*failed',
  'ad.*failed',
  'color.*failed',
  'video-transform.*failed',
  'transcription failed',
  'TTS failed',
  'Video transformation failed',
  
  // Timeouts
  'assemblyai_timeout',
  'assemblyai_error',
  'timeout',
  
  // Redis/Connection issues
  'Redis unavailable',
  'Redis.*error',
  'Redis.*failed',
  'Worker Redis unavailable',
  
  // R2/Storage issues
  'Failed to upload',
  'R2 credentials are not configured',
  'R2_BUCKET environment variable is not set',
  'Failed to download from R2',
  'Failed to upload.*to R2',
  
  // Cloudinary issues
  'Cloudinary upload failed',
  'Cloudinary.*failed',
  'CLOUDINARY_URL not configured',
  
  // Job processing errors
  'Missing videoUrl',
  'assemblyai_create_failed',
  'missing_video_url',
  
  // Server errors
  '500 Internal Server Error',
  'Internal Server Error',
];

// Count occurrences per pattern
interface AlertCount {
  pattern: string;
  count: number;
  threshold: number;
}

const ALERT_THRESHOLDS: Record<string, number> = {
  'captions.*failed': 3,
  'ad.*failed': 3,
  'color.*failed': 3,
  'video-transform.*failed': 3,
  'Redis unavailable': 2,
  'Failed to upload': 5,
  '500 Internal Server Error': 5,
  'timeout': 5,
  default: 3,
};

/**
 * Fetch logs from Render API
 */
async function fetchLogs(): Promise<string> {
  if (!RENDER_SERVICE_ID || !RENDER_API_KEY) {
    throw new Error('RENDER_SERVICE_ID and RENDER_API_KEY environment variables are required');
  }

  try {
    // Render API endpoint for logs
    // https://api.render.com/v1/services/{serviceId}/logs
    const url = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/logs?limit=${LOG_LIMIT}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Render API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Render logs API returns an array of log entries
    // Each entry has: id, timestamp, message, level, serviceId
    if (Array.isArray(data)) {
      return data.map((entry: any) => entry.message || entry.text || JSON.stringify(entry)).join('\n');
    } else if (data.logs && Array.isArray(data.logs)) {
      return data.logs.map((entry: any) => entry.message || entry.text || JSON.stringify(entry)).join('\n');
    } else if (typeof data === 'string') {
      return data;
    } else {
      return JSON.stringify(data);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch Render logs: ${errorMessage}`);
  }
}

/**
 * Scan logs for alert patterns and count occurrences
 */
function scanLogs(logs: string): AlertCount[] {
  const findings: AlertCount[] = [];
  const logText = logs.toLowerCase();

  for (const pattern of ALERT_WORDS) {
    const regex = new RegExp(pattern.toLowerCase(), 'gi');
    const matches = logText.match(regex);
    const count = matches ? matches.length : 0;
    const threshold = ALERT_THRESHOLDS[pattern] || ALERT_THRESHOLDS.default;

    if (count >= threshold) {
      findings.push({
        pattern,
        count,
        threshold,
      });
    }
  }

  return findings;
}

/**
 * Trigger auto-healing test suite
 */
function triggerAutoHeal(): void {
  console.log('🧠 Triggering auto-heal test suite...');
  
  try {
    // Run the auto-heal test suite
    // Using vitest directly since we're in a script context
    execSync('pnpm test:heal', { 
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Ensure auto-heal tests have required env vars
        E2E_BASE_URL: process.env.E2E_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000',
        TEST_API_KEY: process.env.TEST_API_KEY || process.env.API_KEY,
      },
    });
    
    console.log('✅ Auto-heal test suite completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Auto-heal test suite failed:', errorMessage);
    // Don't throw - we still want to log the findings
  }
}

/**
 * Write findings to watchdog log
 */
function logFindings(findings: AlertCount[]): void {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'watchdog.log');
  const timestamp = new Date().toISOString();
  const findingsText = findings.map(f => `${f.pattern} (${f.count} occurrences, threshold: ${f.threshold})`).join(', ');
  
  const logEntry = `[${timestamp}] ⚠️  Issues detected: ${findingsText}\n`;
  
  fs.appendFileSync(logFile, logEntry, 'utf-8');
  console.log(`📝 Findings logged to: ${logFile}`);
}

/**
 * Main scan and heal function
 */
async function scanAndHeal(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`\n🕵️‍♂️ [${timestamp}] Watchdog scanning logs...`);

  try {
    // Fetch logs from Render
    console.log('📥 Fetching logs from Render API...');
    const logs = await fetchLogs();
    
    if (!logs || logs.trim().length === 0) {
      console.log('⚠️  No logs returned from Render API');
      return;
    }

    console.log(`📊 Analyzing ${logs.length} characters of logs...`);

    // Scan for alert patterns
    const findings = scanLogs(logs);

    if (findings.length > 0) {
      console.log(`⚠️  Found ${findings.length} recurring issue(s):`);
      findings.forEach(f => {
        console.log(`   - ${f.pattern}: ${f.count} occurrences (threshold: ${f.threshold})`);
      });

      // Log findings
      logFindings(findings);

      // Trigger auto-healing
      triggerAutoHeal();

      // Optional: Send notification (Slack, email, etc.)
      if (process.env.SLACK_WEBHOOK_URL) {
        try {
          await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 Sinna Watchdog Alert\n\nIssues detected:\n${findings.map(f => `- ${f.pattern} (${f.count}x)`).join('\n')}\n\nAuto-healing triggered. Check logs for details.`,
            }),
          });
          console.log('📢 Slack notification sent');
        } catch (notifError) {
          console.warn('⚠️  Failed to send Slack notification:', notifError);
        }
      }
    } else {
      console.log('✅ No recurring errors detected above thresholds.');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Watchdog error: ${errorMessage}`);
    
    // Log error to watchdog log
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'watchdog.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ❌ Watchdog error: ${errorMessage}\n`, 'utf-8');
  }
}

/**
 * Main entry point
 */
(async () => {
  console.log('🚀 Sinna Watchdog started');
  console.log(`📍 Service ID: ${RENDER_SERVICE_ID || 'NOT SET'}`);
  console.log(`⏰ Poll interval: ${POLL_INTERVAL / 1000 / 60} minutes`);
  console.log(`🔍 Monitoring ${ALERT_WORDS.length} error patterns\n`);

  // Validate configuration
  if (!RENDER_SERVICE_ID || !RENDER_API_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - RENDER_SERVICE_ID (also accepts render_service_id / RENDER_API_SERVICE_ID)');
    console.error('   - RENDER_API_KEY');
    console.error('\n💡 To get these:');
    console.error('   1. Go to Render Dashboard → API tab → Create API Key');
    console.error('   2. Copy your Service ID from the service URL');
    console.error('   3. Set environment variables in Render or .env file');
    process.exit(1);
  }

  // Run initial scan
  await scanAndHeal();

  // Set up interval for continuous monitoring
  setInterval(scanAndHeal, POLL_INTERVAL);
  
  console.log(`\n✅ Watchdog running. Next scan in ${POLL_INTERVAL / 1000 / 60} minutes...`);
  console.log('📄 Reports will be saved to:');
  console.log('   - logs/watchdog.log');
  console.log('   - tests/reports/autoheal-report.md\n');
})();

