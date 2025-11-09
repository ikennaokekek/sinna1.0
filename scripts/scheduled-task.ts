#!/usr/bin/env tsx
/**
 * Scheduled Cron Job - Runs every 5 days
 * 
 * This script runs automatically every 5 days via Render Cron Job.
 * Modify the `runScheduledTask()` function to perform your desired task.
 * 
 * Schedule: Every 5 days at midnight UTC
 * Cron expression: 0 0 */5 * *
 */

import { getDb } from '../apps/api/src/lib/db';

/**
 * Main scheduled task - modify this function to perform your desired job
 */
async function runScheduledTask(): Promise<void> {
  console.log(`[Cron Job] Starting scheduled task at ${new Date().toISOString()}`);
  
  try {
    // TODO: Add your task logic here
    // Examples:
    // - Clean up old database records
    // - Send summary emails
    // - Generate reports
    // - Update statistics
    // - Archive old data
    
    // Example: Log current tenant count
    const { pool } = getDb();
    const result = await pool.query('SELECT COUNT(*) as count FROM tenants WHERE active = true');
    const activeTenants = result.rows[0]?.count || 0;
    
    console.log(`[Cron Job] Active tenants: ${activeTenants}`);
    console.log(`[Cron Job] Task completed successfully`);
    
  } catch (error) {
    console.error('[Cron Job] Task failed:', error instanceof Error ? error.message : String(error));
    throw error; // Re-throw to mark cron job as failed
  }
}

// Run the task
runScheduledTask()
  .then(() => {
    console.log('[Cron Job] Exiting successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Cron Job] Exiting with error:', error);
    process.exit(1);
  });

