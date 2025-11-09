# 📅 Scheduled Cron Job - Every 5 Days

## Overview

This cron job runs automatically every 5 days at midnight UTC to perform scheduled maintenance tasks.

**Schedule:** `0 0 */5 * *` (Every 5 days at 00:00 UTC)

---

## 🚀 Setup

### 1. Configure the Task

Edit `scripts/scheduled-task.ts` and modify the `runScheduledTask()` function:

```typescript
async function runScheduledTask(): Promise<void> {
  console.log(`[Cron Job] Starting scheduled task at ${new Date().toISOString()}`);
  
  try {
    // Add your task logic here
    // Examples:
    
    // Clean up old database records
    // const { pool } = getDb();
    // await pool.query('DELETE FROM jobs WHERE created_at < NOW() - INTERVAL \'30 days\'');
    
    // Send summary emails
    // await sendEmailNotice('admin@example.com', 'Weekly Summary', '...');
    
    // Generate reports
    // const report = await generateUsageReport();
    // console.log('Report:', report);
    
    console.log(`[Cron Job] Task completed successfully`);
  } catch (error) {
    console.error('[Cron Job] Task failed:', error);
    throw error;
  }
}
```

### 2. Add Required Environment Variables

If your task needs additional environment variables, add them to `render.yaml`:

```yaml
envVars:
  - key: DATABASE_URL
    sync: false
  # Add more as needed:
  # - key: RESEND_API_KEY
  #   sync: false
  # - key: REDIS_URL
  #   sync: false
```

### 3. Deploy

The cron job is automatically configured in `render.yaml`. After deploying:

1. Go to Render Dashboard → Cron Jobs
2. Find `sinna-scheduled-task`
3. Verify it's scheduled correctly
4. Check logs after first run

---

## 📋 Common Task Examples

### Database Cleanup
```typescript
const { pool } = getDb();
// Delete old jobs
await pool.query(`
  DELETE FROM jobs 
  WHERE created_at < NOW() - INTERVAL '90 days'
`);
console.log('Cleaned up old jobs');
```

### Usage Report
```typescript
const { pool } = getDb();
const result = await pool.query(`
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(DISTINCT tenant_id) as active_tenants,
    SUM(usage_minutes) as total_minutes
  FROM jobs
  WHERE created_at >= NOW() - INTERVAL '5 days'
`);
console.log('Usage report:', result.rows[0]);
```

### Email Summary
```typescript
import { sendEmailNotice } from '../apps/api/src/lib/email';

const summary = await generateSummary();
await sendEmailNotice(
  'admin@example.com',
  '5-Day Summary Report',
  `Summary:\n${JSON.stringify(summary, null, 2)}`
);
```

### Health Check
```typescript
// Verify all services are healthy
const health = await checkServices();
if (!health.allHealthy) {
  await sendAlert('Some services are unhealthy', health);
}
```

---

## 🔍 Monitoring

### Check Logs

**Render Dashboard:**
1. Go to: Render Dashboard → Cron Jobs → `sinna-scheduled-task`
2. Click "Logs" tab
3. Look for execution logs

**Expected Logs:**
```
[Cron Job] Starting scheduled task at 2025-01-01T00:00:00.000Z
[Cron Job] Active tenants: 5
[Cron Job] Task completed successfully
[Cron Job] Exiting successfully
```

### Manual Test

Test locally before deploying:

```bash
# Set environment variables
export DATABASE_URL=your_database_url

# Run the script
pnpm tsx scripts/scheduled-task.ts
```

---

## ⚙️ Schedule Configuration

**Current Schedule:** `0 0 */5 * *` (Every 5 days at midnight UTC)

**Cron Format:** `minute hour day month weekday`

**Common Schedules:**
- `0 0 */5 * *` - Every 5 days at midnight
- `0 0 * * *` - Daily at midnight
- `0 0 * * 0` - Weekly on Sunday
- `0 0 1 * *` - Monthly on 1st day
- `0 */6 * * *` - Every 6 hours

**To Change Schedule:**
Edit `render.yaml`:
```yaml
schedule: "0 0 */5 * *"  # Change this
```

---

## 🚨 Error Handling

The cron job will:
- ✅ Log all output to Render logs
- ✅ Exit with code 0 on success
- ✅ Exit with code 1 on failure
- ✅ Render will mark failed runs in dashboard

**If task fails:**
1. Check Render logs for error details
2. Fix the issue in `scripts/scheduled-task.ts`
3. Redeploy (Render will retry on next schedule)

---

## 📝 Notes

- **Free Plan:** Render cron jobs on free plan have execution time limits
- **Database Access:** Ensure `DATABASE_URL` is set in Render environment
- **Dependencies:** All dependencies from `package.json` are available
- **Logging:** All `console.log` output appears in Render logs

---

## ✅ Next Steps

1. **Edit `scripts/scheduled-task.ts`** with your task logic
2. **Add required environment variables** to `render.yaml` if needed
3. **Deploy** to Render
4. **Monitor** first execution in Render logs
5. **Verify** task runs every 5 days

**Ready to customize!** 🎉

