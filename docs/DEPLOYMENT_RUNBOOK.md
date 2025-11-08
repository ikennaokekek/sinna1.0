# Sinna API Deployment Runbook

## Pre-Deployment Checklist

### 1. Environment Variables Verification
- [ ] All required environment variables are set in Render Environment Group
- [ ] Stripe keys are production keys (not test keys)
- [ ] Database URL points to production database
- [ ] Redis URL points to production Redis instance
- [ ] CORS_ORIGINS includes all allowed frontend domains
- [ ] SENTRY_DSN is configured for error tracking

### 2. Database Migration
```bash
# Run migrations before deployment
cd apps/api
pnpm migrate
```

### 3. Database Backup
- [ ] Create database backup before migration
- [ ] Verify backup is accessible

### 4. Code Verification
- [ ] All tests pass: `pnpm --filter @sinna/api test`
- [ ] Build succeeds: `pnpm --filter @sinna/api build`
- [ ] No TypeScript errors
- [ ] No linter errors

## Deployment Steps

### Step 1: Deploy API Service
1. Push code to main branch (triggers auto-deploy if enabled)
2. OR manually trigger deployment in Render dashboard
3. Monitor deployment logs for errors

### Step 2: Deploy Worker Service
1. Ensure worker service is linked to same Environment Group
2. Deploy worker service after API service
3. Verify worker connects to Redis and queues

### Step 3: Verify Deployment
```bash
# Health check
curl https://sinna1-0.onrender.com/health -H "X-API-Key: YOUR_KEY"

# Readiness check
curl https://sinna1-0.onrender.com/readiness -H "X-API-Key: YOUR_KEY"

# Metrics check
curl https://sinna1-0.onrender.com/metrics
```

### Step 4: Smoke Tests
1. Create a test job via API
2. Verify job is queued
3. Check worker processes job
4. Verify job status endpoint returns correct status
5. Test webhook endpoint (use Stripe CLI)

## Post-Deployment Verification

### 1. Monitor Logs
- Check Render logs for errors
- Verify no startup errors
- Check for rate limiting issues

### 2. Monitor Metrics
- Check Prometheus metrics endpoint
- Verify request rates are normal
- Check error rates
- Monitor queue depths

### 3. Database Verification
- Verify migrations applied successfully
- Check tenant records are accessible
- Verify indexes are created

### 4. External Service Verification
- Stripe webhooks are receiving events
- Cloudflare R2 is accessible
- Email service (Resend/SendGrid) is working

## Rollback Procedure

### If Deployment Fails:

1. **Immediate Rollback:**
   - Go to Render dashboard
   - Select previous successful deployment
   - Click "Rollback to this deployment"

2. **Database Rollback (if migrations failed):**
   ```sql
   -- Restore from backup if needed
   -- Or manually rollback migration if safe
   ```

3. **Verify Rollback:**
   - Check health endpoint
   - Verify no errors in logs
   - Run smoke tests

## Emergency Procedures

### Service Down
1. Check Render dashboard for service status
2. Check logs for errors
3. Verify database connectivity
4. Check Redis connectivity
5. Restart service if needed

### High Error Rate
1. Check Sentry for error details
2. Review recent code changes
3. Check external service status (Stripe, R2, etc.)
4. Consider rolling back if error rate is critical

### Database Issues
1. Check database connection pool exhaustion
2. Review slow queries
3. Check for deadlocks
4. Consider scaling database if needed

### Rate Limiting Issues
1. Check Redis connectivity
2. Verify rate limit configuration
3. Check for DDoS attacks
4. Review rate limit thresholds

## Scaling Guidelines

### When to Scale API Service
- CPU usage consistently >70%
- Memory usage >80%
- Request latency >500ms p95
- Error rate >1%

### When to Scale Worker Service
- Queue depth consistently >1000
- Job processing time >5 minutes average
- Worker CPU >70%

### When to Scale Database
- Connection pool exhaustion
- Query latency >100ms average
- CPU usage >70%

## Monitoring & Alerts

### Key Metrics to Monitor
- Request rate (requests/second)
- Error rate (errors/requests)
- P95 latency (milliseconds)
- Queue depth (jobs waiting)
- Database connection pool usage
- Redis memory usage

### Alert Thresholds
- Error rate >5%: Warning
- Error rate >10%: Critical
- P95 latency >2s: Warning
- P95 latency >5s: Critical
- Queue depth >5000: Warning
- Queue depth >10000: Critical

## Maintenance Windows

### Recommended Maintenance Schedule
- **Weekly:** Review logs and metrics
- **Monthly:** Database optimization and cleanup
- **Quarterly:** Dependency updates and security patches

### Maintenance Steps
1. Announce maintenance window
2. Enable maintenance mode (if available)
3. Run database maintenance (VACUUM, ANALYZE)
4. Review and optimize slow queries
5. Update dependencies
6. Run full test suite
7. Deploy updates
8. Disable maintenance mode

## Contact Information

- **On-Call Engineer:** [Configure in Render]
- **Sentry:** https://sentry.io/[your-project]
- **Render Dashboard:** https://dashboard.render.com

