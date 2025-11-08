# Environment Variables Documentation

## Required Variables

### Database
- **`DATABASE_URL`** (Required)
  - PostgreSQL connection string
  - Format: `postgresql://user:password@host:port/database`
  - Example: `postgresql://sinna:password@dpg-xxx.oregon-postgres.render.com:5432/sinna_db`
  - Used for: Primary database connection

### Redis
- **`REDIS_URL`** (Optional, but recommended)
  - Redis connection string for queue and rate limiting
  - Format: `redis://user:password@host:port` or `rediss://...` for TLS
  - Example: `redis://sinna-redis:6379`
  - Used for: BullMQ queues, rate limiting, idempotency caching
  - Fallback: In-memory rate limiter if not provided

### Stripe
- **`STRIPE_SECRET_KEY`** (Required for billing)
  - Stripe secret API key
  - Format: `sk_live_...` (production) or `sk_test_...` (testing)
  - Example: `sk_live_51AbCdEf...`
  - Used for: Creating checkout sessions, processing payments

- **`STRIPE_WEBHOOK_SECRET`** (Required for webhooks)
  - Stripe webhook signing secret
  - Format: `whsec_...`
  - Example: `whsec_1234567890abcdef`
  - Used for: Verifying webhook signatures

- **`STRIPE_STANDARD_PRICE_ID`** (Required for subscriptions)
  - Stripe Price ID for standard plan
  - Format: `price_...`
  - Example: `price_1234567890abcdef`
  - Used for: Creating checkout sessions

### Cloudflare R2
- **`R2_ACCOUNT_ID`** (Required)
  - Cloudflare R2 account ID
  - Format: Alphanumeric string
  - Example: `a1b2c3d4e5f6g7h8i9j0`
  - Used for: R2 client initialization

- **`R2_ACCESS_KEY_ID`** (Required)
  - Cloudflare R2 access key ID
  - Format: Alphanumeric string
  - Example: `abc123def456ghi789`
  - Used for: R2 authentication

- **`R2_SECRET_ACCESS_KEY`** (Required)
  - Cloudflare R2 secret access key
  - Format: Alphanumeric string
  - Example: `secret123456789abcdef`
  - Used for: R2 authentication

- **`R2_BUCKET`** (Required)
  - Cloudflare R2 bucket name
  - Format: Alphanumeric string with hyphens
  - Example: `sinna-artifacts`
  - Used for: Object storage bucket name

- **`R2_ENDPOINT`** (Required)
  - Cloudflare R2 endpoint URL
  - Format: `https://...`
  - Example: `https://xxx.r2.cloudflarestorage.com`
  - Used for: R2 API endpoint

### Email Services
- **`RESEND_API_KEY`** (Optional, preferred)
  - Resend API key for sending emails
  - Format: `re_...`
  - Example: `re_1234567890abcdef`
  - Used for: Email notifications (primary)

- **`SENDGRID_API_KEY`** (Optional, fallback)
  - SendGrid API key for sending emails
  - Format: `SG....`
  - Example: `SG.1234567890abcdef`
  - Used for: Email notifications (fallback if Resend not available)

- **`NOTIFY_FROM_EMAIL`** (Required)
  - Email address to send notifications from
  - Format: Valid email address
  - Example: `noreply@sinna.com`
  - Used for: From address in email notifications

- **`NOTIFY_FALLBACK_EMAIL`** (Optional)
  - Fallback email for notifications
  - Format: Valid email address
  - Example: `admin@sinna.com`
  - Used for: Admin notifications when customer email unavailable

### API Configuration
- **`BASE_URL`** (Required)
  - Base URL of the API
  - Format: `https://...` or `http://...`
  - Example: `https://sinna1-0.onrender.com`
  - Used for: Generating checkout URLs, email links

- **`PORT`** (Optional, default: 4000)
  - Port to run the API server on
  - Format: Number
  - Example: `4000`
  - Used for: Server port configuration

- **`NODE_ENV`** (Optional, default: development)
  - Node.js environment
  - Values: `development`, `production`, `test`
  - Example: `production`
  - Used for: Environment-specific behavior

- **`CORS_ORIGINS`** (Required in production)
  - Comma-separated list of allowed CORS origins
  - Format: `origin1,origin2,origin3`
  - Example: `https://app.sinna.com,https://www.sinna.com`
  - Used for: CORS configuration

### Security
- **`ADMIN_API_KEY`** (Optional)
  - Admin API key for test endpoints
  - Format: Any string
  - Example: `admin-secret-key-123`
  - Used for: Admin authentication for test endpoints

- **`TRUST_PROXIES`** (Optional, default: 0)
  - Trust proxy headers (for Render, Cloudflare, etc.)
  - Values: `0` or `1`
  - Example: `1`
  - Used for: Correct IP address detection

- **`WEBHOOK_SIGNING_SECRET`** (Optional)
  - Secret for HMAC webhook signature verification
  - Format: Any string
  - Example: `webhook-secret-123`
  - Used for: Verifying webhook signatures (non-Stripe)

- **`WEBHOOK_HMAC_HEADER`** (Optional, default: x-webhook-signature)
  - Header name for HMAC signature
  - Format: Header name
  - Example: `x-webhook-signature`
  - Used for: Custom webhook signature header

- **`TRUSTED_CIDRS`** (Optional)
  - Comma-separated list of trusted CIDR blocks
  - Format: `cidr1,cidr2`
  - Example: `10.0.0.0/8,172.16.0.0/12`
  - Used for: Bypassing rate limits for trusted IPs

### Monitoring & Observability
- **`SENTRY_DSN`** (Optional)
  - Sentry DSN for error tracking
  - Format: `https://...@sentry.io/...`
  - Example: `https://abc123@o123456.ingest.sentry.io/123456`
  - Used for: Error tracking and monitoring

- **`STATUS_PAGE_URL`** (Optional)
  - URL to status page
  - Format: `https://...`
  - Example: `https://status.sinna.com`
  - Used for: Status page link in headers

### Worker Configuration
- **`ASSEMBLYAI_API_KEY`** (Required for worker)
  - AssemblyAI API key for transcription
  - Format: Alphanumeric string
  - Example: `abc123def456ghi789`
  - Used for: Video transcription (worker service)

- **`OPENAI_API_KEY`** (Required for worker)
  - OpenAI API key for TTS
  - Format: `sk-...`
  - Example: `sk-1234567890abcdef`
  - Used for: Text-to-speech (worker service)

### Feature Flags
- **`STRIPE_TESTING`** (Optional, default: false)
  - Enable Stripe testing mode
  - Values: `true` or `false`
  - Example: `false`
  - Used for: Allowing webhooks without signature verification in dev

- **`RUN_MIGRATIONS_ON_BOOT`** (Optional, default: 0)
  - Run database migrations on startup
  - Values: `0` or `1`
  - Example: `1`
  - Used for: Automatic migration on deployment

- **`GRACE_DAYS`** (Optional, default: 7)
  - Number of grace days after payment failure
  - Format: Number
  - Example: `7`
  - Used for: Grace period calculation

## Optional Variables

### Development & Testing
- **`LOG_LEVEL`** (Optional)
  - Logging level
  - Values: `debug`, `info`, `warn`, `error`
  - Example: `info`
  - Used for: Controlling log verbosity

## Environment Variable Validation

The API validates all required environment variables on startup. Missing required variables will cause the server to exit with an error (except in development/test mode).

## Production Checklist

Before deploying to production, ensure:
- [ ] All required variables are set
- [ ] Change all default/test values to production values
- [ ] Stripe keys are production keys
- [ ] Database URL points to production database
- [ ] CORS_ORIGINS includes only production domains
- [ ] NODE_ENV is set to `production`
- [ ] TRUST_PROXIES is set to `1` if behind proxy
- [ ] SENTRY_DSN is configured for error tracking

## Security Notes

- Never commit `.env` files to version control
- Use Render Environment Groups for production secrets
- Rotate secrets regularly
- Use different keys for staging and production
- Keep `env.example` with placeholder values only

