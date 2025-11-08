# Roadmap to 100/100 Production Readiness

**Current Score: 60/100**  
**Target Score: 100/100**

This document lists every action item needed to achieve perfect production readiness.

---

## 🔴 CRITICAL (Must Complete - Blocks Launch)

### Database & Schema
- [ ] **Run database migration** - Add Stripe customer/subscription columns
  ```sql
  -- Connect to Render Postgres and run:
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_tenants_stripe_subscription ON tenants(stripe_subscription_id);
  ```
  **File:** `apps/api/migrations/001_init.sql` (already updated, just needs execution)

- [ ] **Verify migration ran successfully**
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'tenants' AND column_name IN ('stripe_customer_id', 'stripe_subscription_id');
  ```

### Security - Secrets Management
- [ ] **Remove `render-env-vars.txt` from repository**
  ```bash
  git rm render-env-vars.txt
  echo "render-env-vars.txt" >> .gitignore
  git commit -m "Remove exposed secrets file"
  ```

- [ ] **Rotate ALL exposed API keys** (Critical - do immediately):
  - [ ] Stripe Secret Key (`sk_live_...`)
  - [ ] Stripe Webhook Secret (`whsec_...`)
  - [ ] R2 Access Key ID
  - [ ] R2 Secret Access Key
  - [ ] OpenAI API Key (`sk-proj-...`)
  - [ ] AssemblyAI API Key
  - [ ] SendGrid API Key (`SG....`)
  - [ ] Resend API Key (`re_...`)
  - [ ] Redis URL (Upstash)
  - [ ] Sentry DSN

- [ ] **Update Render Environment Group** with new rotated keys
  - Go to Render Dashboard → Environment Groups
  - Update each secret with new rotated value
  - Verify no placeholders (xxx, __, etc.)

### Stripe Configuration
- [ ] **Verify Stripe keys are LIVE (not test)**
  - Check `STRIPE_SECRET_KEY` starts with `sk_live_`
  - Check `STRIPE_WEBHOOK_SECRET` is from live webhook endpoint

- [ ] **Set `STRIPE_STANDARD_PRICE_ID`** to your live Stripe price ID
  - Format: `price_xxxxxxxxxxxxx`
  - Must be from LIVE mode Stripe dashboard

- [ ] **Configure Stripe Webhook Endpoint** in Stripe Dashboard
  - URL: `https://your-api.onrender.com/webhooks/stripe`
  - Events to listen: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`
  - Copy webhook signing secret to Render env vars

- [ ] **Test all Stripe webhook events**:
  - [ ] `checkout.session.completed` - Creates tenant and API key
  - [ ] `invoice.payment_succeeded` - Activates tenant
  - [ ] `invoice.payment_failed` - Enters grace period

---

## 🟠 HIGH PRIORITY (Complete Before Launch)

### Security Hardening

#### Remove Console.log Statements (43 instances)
- [ ] **Replace console.log in `apps/api/src/lib/email.ts`** (10 instances)
  - Lines: 4, 16, 32, 35, 38, 46, 62, 65, 68, 73
  - Replace with: `app.log.info()`, `app.log.warn()`, `app.log.error()`
  - Use structured logging with appropriate log levels

- [ ] **Replace console.log in `apps/api/src/index.ts`** (2 instances)
  - Lines: 739
  - Replace with: `app.log.info()`

- [ ] **Replace console.log in `apps/api/src/lib/redis.ts`** (1 instance)
  - Line: 15
  - Replace with: `app.log.warn()`

- [ ] **Replace console.log in `apps/api/src/scripts/seed.ts`** (7 instances)
  - Lines: 9, 13, 18, 21, 23, 24, 28
  - Replace with: `console.log()` is OK for scripts, but add log levels

- [ ] **Replace console.log in `apps/worker/src/index.ts`** (18 instances)
  - Lines: 7, 35, 38, 42, 128, 132, 135, 138, 143, 151, 174, 180, 224, 230, 238, 258, 263, 267
  - Install a logging library (Pino/Winston) or use structured console output
  - Replace with: `logger.info()`, `logger.warn()`, `logger.error()`

**Implementation Example:**
```typescript
// Install: pnpm add pino
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Replace:
console.log('[EMAIL:SENT]', { to, subject });
// With:
logger.info({ to, subject }, 'Email sent successfully');
```

#### Secure Test Endpoints
- [ ] **Add authentication to `/test-email` endpoint**
  - Option 1: Require API key authentication
  - Option 2: Add IP whitelist for admin IPs
  - Option 3: Remove endpoint in production (recommended)
  
  **Code Change:**
  ```typescript
  // Remove from public routes, or add auth:
  app.post('/test-email', async (req, reply) => {
    // Add admin check
    const adminKey = process.env.ADMIN_API_KEY;
    const providedKey = req.headers['x-admin-key'];
    if (adminKey && providedKey !== adminKey) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    // ... rest of code
  });
  ```

- [ ] **Add authentication to `/email-status` endpoint**
  - Same options as above

- [ ] **Remove hardcoded email address** from test endpoint
  - Line 184: Remove `'ikennaokeke1996@gmail.com'`
  - Require email in request body

#### Rate Limiting
- [ ] **Add rate limiting to `/webhooks/stripe` endpoint**
  - Current: No rate limiting (bypasses global limiter)
  - Add: Higher limit but still limited (e.g., 100 req/min)
  
  **Code Change:**
  ```typescript
  // Add before webhook route
  const webhookLimiter = new RateLimiterRedis({
    storeClient: redis as any,
    points: 100, // Higher limit for webhooks
    duration: 60,
    keyPrefix: 'rlf:webhook',
  });
  
  app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, res) => {
    // Add rate limit check
    try {
      await webhookLimiter.consume(req.ip, 1);
    } catch (rej) {
      return res.code(429).send({ error: 'rate_limited' });
    }
    // ... rest of handler
  });
  ```

### Input Validation & Security
- [ ] **Add input validation to `/v1/files/:id:sign` endpoint**
  - Validate `id` parameter is safe (no path traversal)
  - Validate `ttl` is within reasonable bounds (1-86400)
  
  **Code Change:**
  ```typescript
  app.get('/v1/files/:id:sign', async (req, res) => {
    const params = z.object({
      id: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\-/]+$/), // Safe characters only
      ttl: z.coerce.number().int().positive().max(86400).optional()
    }).parse({ ...req.params, ...req.query });
    // ... rest
  });
  ```

- [ ] **Add validation to prevent SQL injection** (verify all queries use parameterized queries)
  - ✅ Already using parameterized queries (`$1`, `$2`, etc.)
  - No action needed, but verify in code review

### Environment Variables
- [ ] **Add missing environment variables to Render**:
  - [ ] `GRACE_DAYS` (defaults to 7, but should be explicit)
  - [ ] `TRUST_PROXIES` (optional, set to "1" if behind proxy)
  - [ ] `TRUSTED_CIDRS` (optional, comma-separated CIDR blocks)
  - [ ] `WEBHOOK_HMAC_HEADER` (optional, defaults to 'x-webhook-signature')
  - [ ] `NOTIFY_FALLBACK_EMAIL` (used in payment_failed handler)
  - [ ] `ADMIN_API_KEY` (if securing test endpoints)

- [ ] **Verify `CORS_ORIGINS` is set** (required in production)
  - Format: `https://app.yourdomain.com,https://studio.yourdomain.com`
  - Must NOT be empty in production

- [ ] **Update `render.yaml`** to include all environment variables
  - Add missing vars from list above

### Error Handling
- [ ] **Add error handling for R2 operations**
  - File: `apps/api/src/lib/r2.ts`
  - Add try-catch around S3 operations
  - Return meaningful error messages

- [ ] **Add error handling for worker R2 uploads**
  - File: `apps/worker/src/lib/r2.ts`
  - Add try-catch and retry logic

- [ ] **Improve error handling in worker OpenAI calls**
  - File: `apps/worker/src/index.ts:148-176`
  - Add proper error logging
  - Add fallback audio generation

---

## 🟡 MEDIUM PRIORITY (Complete Week 1-2)

### Code Quality

#### TypeScript Improvements
- [ ] **Remove `any` types** (found in multiple files)
  - Replace with proper TypeScript types
  - Files to fix:
    - `apps/api/src/index.ts` (multiple locations)
    - Add proper types for `req` and `reply` objects
    - Add types for Stripe event handlers

#### Error Handling Consistency
- [ ] **Standardize error responses** across all endpoints
  - Create error response helper function
  - Use consistent error codes and messages

- [ ] **Add error boundaries** for async operations
  - Ensure all async operations have try-catch
  - Add proper error logging

#### Code Organization
- [ ] **Extract webhook handlers** to separate file
  - File: `apps/api/src/index.ts` (lines 575-677)
  - Create: `apps/api/src/routes/webhooks.ts`
  - Improves maintainability

- [ ] **Extract billing routes** to separate file
  - File: `apps/api/src/index.ts` (lines 263-285)
  - Create: `apps/api/src/routes/billing.ts`

- [ ] **Extract job routes** to separate file
  - File: `apps/api/src/index.ts` (lines 392-559)
  - Create: `apps/api/src/routes/jobs.ts`

### Monitoring & Observability
- [ ] **Set up proper logging** (Pino or Winston)
  - Replace all console.log statements
  - Configure log levels (INFO, WARN, ERROR)
  - Set up log aggregation (if needed)

- [ ] **Add request ID tracking**
  - Generate UUID for each request
  - Include in all log statements
  - Helps trace requests across services

- [ ] **Add performance monitoring**
  - Track slow requests (>1s)
  - Track database query times
  - Track external API call times

- [ ] **Set up alerts** for:
  - High error rates (>5%)
  - Slow response times (>2s p95)
  - Queue depth exceeding thresholds
  - Database connection failures

### Testing
- [ ] **Add unit tests** for critical functions:
  - [ ] `hashKey()` function
  - [ ] `incrementAndGateUsage()` function
  - [ ] `seedTenantAndApiKey()` function
  - [ ] Webhook handlers

- [ ] **Add integration tests**:
  - [ ] Stripe webhook handling
  - [ ] Job creation and processing
  - [ ] Usage gating
  - [ ] Rate limiting

- [ ] **Add E2E tests**:
  - [ ] Complete job flow (create → process → retrieve)
  - [ ] Stripe checkout → webhook → tenant activation
  - [ ] Payment failure → grace period

- [ ] **Set up CI/CD testing**
  - Run tests on every PR
  - Block merge if tests fail

### Documentation
- [ ] **Update API documentation** with:
  - Webhook endpoint details
  - Error response formats
  - Rate limiting information
  - Usage limits per plan

- [ ] **Add deployment runbook**
  - Step-by-step deployment process
  - Rollback procedures
  - Health check procedures

- [ ] **Document environment variables**
  - Complete list with descriptions
  - Required vs optional
  - Default values

---

## 🟢 LOW PRIORITY (Complete Week 3-4)

### Performance Optimization
- [ ] **Optimize database queries**
  - Add indexes for frequently queried columns
  - Review query performance
  - Add query result caching where appropriate

- [ ] **Optimize Redis usage**
  - Review cache TTLs
  - Implement cache warming
  - Monitor cache hit rates

- [ ] **Add connection pooling** optimizations
  - Review pool sizes
  - Monitor connection usage

### Feature Completeness
- [ ] **Store Stripe subscription ID** in webhook handlers
  - Update `checkout.session.completed` handler
  - Store `session.subscription` in tenant record

- [ ] **Handle subscription cancellation** webhook
  - Add handler for `customer.subscription.deleted`
  - Deactivate tenant appropriately

- [ ] **Handle subscription updates** webhook
  - Add handler for `customer.subscription.updated`
  - Update tenant plan if changed

- [ ] **Add subscription status endpoint**
  - `GET /v1/me/subscription`
  - Returns current subscription status

### Cleanup
- [ ] **Remove dead code** from archive folder
  - Or move to separate branch/tag
  - Reduces confusion

- [ ] **Remove unused dependencies**
  - Review `package.json` files
  - Remove unused packages

- [ ] **Clean up TODO comments**
  - Address or remove TODOs
  - Update code documentation

---

## ✅ VERIFICATION CHECKLIST

Before marking as 100/100, verify:

### Code Quality (10/10)
- [ ] All TypeScript errors resolved
- [ ] All `any` types replaced
- [ ] Code compiles without warnings
- [ ] All imports resolved
- [ ] No dead code

### Security (10/10)
- [ ] No exposed secrets in repository
- [ ] All API keys rotated
- [ ] Console.log statements removed
- [ ] Test endpoints secured
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] No hardcoded credentials

### API Connections (10/10)
- [ ] Stripe webhooks tested and working
- [ ] R2 uploads/downloads working
- [ ] Database connections stable
- [ ] Redis connections stable
- [ ] Email sending working (Resend/SendGrid)
- [ ] OpenAI API working
- [ ] AssemblyAI API working

### Database (10/10)
- [ ] Schema migrations applied
- [ ] Indexes created
- [ ] Foreign keys validated
- [ ] Queries optimized
- [ ] Backup strategy in place

### Error Handling (10/10)
- [ ] All async operations have error handling
- [ ] Error responses standardized
- [ ] Errors logged properly
- [ ] No unhandled promise rejections

### Configuration (10/10)
- [ ] All environment variables set in Render
- [ ] No placeholder values
- [ ] Production vs development configs separated
- [ ] Secrets management in place

### Testing (10/10)
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing
- [ ] Test coverage >80%

### Monitoring (10/10)
- [ ] Logging configured
- [ ] Metrics collection working
- [ ] Alerts configured
- [ ] Health checks passing
- [ ] Error tracking (Sentry) working

### Documentation (10/10)
- [ ] API documentation complete
- [ ] Deployment docs complete
- [ ] Environment variables documented
- [ ] Runbooks created

### Performance (10/10)
- [ ] Response times <500ms p95
- [ ] Database queries optimized
- [ ] Caching implemented
- [ ] Queue processing efficient

---

## 📊 SCORING BREAKDOWN

### Current Score: 60/100

| Category | Current | Target | Points to Gain |
|----------|---------|--------|----------------|
| Code Quality | 6/10 | 10/10 | +4 |
| Security | 4/10 | 10/10 | +6 |
| API Connections | 7/10 | 10/10 | +3 |
| Database | 5/10 | 10/10 | +5 |
| Error Handling | 6/10 | 10/10 | +4 |
| Configuration | 5/10 | 10/10 | +5 |
| Testing | 4/10 | 10/10 | +6 |
| Monitoring | 5/10 | 10/10 | +5 |
| Documentation | 7/10 | 10/10 | +3 |
| Performance | 5/10 | 10/10 | +5 |

**Total Points Needed: 46**

---

## 🎯 PRIORITY ORDER

### Week 1 (Critical + High Priority)
1. Database migration
2. Remove exposed secrets
3. Rotate all API keys
4. Replace console.log statements
5. Secure test endpoints
6. Add rate limiting to webhooks
7. Add input validation
8. Verify all environment variables

### Week 2 (Medium Priority)
1. Extract routes to separate files
2. Improve TypeScript types
3. Add comprehensive error handling
4. Set up proper logging
5. Add unit tests
6. Add integration tests

### Week 3-4 (Low Priority)
1. Performance optimization
2. Add subscription webhook handlers
3. Clean up code
4. Improve documentation
5. Set up monitoring alerts

---

## 📝 NOTES

- **Estimate:** 3-4 weeks to reach 100/100
- **Critical blockers:** Must be fixed before launch
- **High priority:** Should be fixed before launch
- **Medium/Low priority:** Can be done post-launch but recommended

---

**Last Updated:** 2024-12-19  
**Next Review:** After completing Week 1 items

