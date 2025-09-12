# Sinna API - Deployment Guide

This guide covers deploying the Sinna API to Render with separate API and worker services.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Code must be in a GitHub repository
3. **Environment Variables**: All secrets configured (see SECRETS.md)

## Deployment Architecture

The Sinna API uses a multi-service architecture on Render:

```
┌─────────────────┐    ┌─────────────────┐
│   Sinna API     │    │  Sinna Worker   │
│  (Web Service)  │    │ (Worker Service)│
│                 │    │                 │
│ • REST API      │    │ • Queue Jobs    │
│ • Webhooks      │    │ • Media Proc.   │
│ • Health Checks │    │ • Background    │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
                     │
            ┌─────────────────┐
            │  Upstash Redis  │
            │   (External)    │
            └─────────────────┘
```

## Quick Deploy

### Option 1: Deploy from GitHub (Recommended)

1. **Connect Repository**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml`

2. **Configure Environment Variables**:
   ```bash
   # Required secrets (add in Render Dashboard)
   REDIS_URL=your_upstash_redis_url
   R2_ACCOUNT_ID=your_r2_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret
   R2_BUCKET=your_r2_bucket_name
   
   # Optional but recommended
   ASSEMBLYAI_API_KEY=your_assemblyai_key
   OPENAI_API_KEY=your_openai_key
   STRIPE_SECRET_KEY=your_stripe_secret
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   CLOUDINARY_URL=your_cloudinary_url
   SENTRY_DSN=your_sentry_dsn
   ```

3. **Deploy**:
   - Click "Apply"
   - Render will deploy both API and Worker services
   - Monitor deployment logs for any issues

### Option 2: Manual Service Creation

If you prefer manual setup:

1. **Create API Service**:
   - Service Type: Web Service
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/health`

2. **Create Worker Service**:
   - Service Type: Background Worker
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm run start:worker`

## Environment Configuration

### Required Environment Variables

Add these in Render Dashboard → Service → Environment:

```bash
# Core Configuration
NODE_ENV=production
PORT=10000  # Render assigns this automatically
BASE_URL=https://your-app-name.onrender.com

# Database & Cache
REDIS_URL=rediss://default:password@host:port

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=your_bucket_name

# AI Services
ASSEMBLYAI_API_KEY=your_assemblyai_key
OPENAI_API_KEY=your_openai_key
PROVIDER_CAPTIONS=assemblyai_realtime
PROVIDER_TTS=openai
PROVIDER_CAPTIONS_VOD=whisper

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Monitoring
SENTRY_DSN=https://...@sentry.io/...

# Security
JWT_SECRET=auto-generated-by-render
API_RATE_LIMIT=1000

# Feature Flags
FEATURE_REALTIME=0
GPU_PROVIDER=none
```

## Health Checks & Monitoring

### Built-in Health Checks

The API includes comprehensive health monitoring:

- **`/health`** - Full system health check
- **`/ping`** - Simple uptime check
- **`/metrics`** - Prometheus metrics

### Render Health Check Configuration

```yaml
healthCheck:
  path: /health
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 3
```

### Monitoring Integration

1. **Sentry**: Automatic error tracking and performance monitoring
2. **Prometheus Metrics**: Available at `/metrics` endpoint
3. **Grafana**: Optional dashboard integration via push gateway

## Scaling Configuration

### Auto-scaling Settings

```yaml
scaling:
  # API Service
  minInstances: 1
  maxInstances: 10
  targetMemoryPercent: 70
  targetCPUPercent: 70
  
  # Worker Service  
  minInstances: 1
  maxInstances: 5
  targetMemoryPercent: 80
  targetCPUPercent: 80
```

### Performance Recommendations

- **API Service**: Standard plan minimum for production
- **Worker Service**: Standard plan for background processing
- **Memory**: Monitor `/metrics` for memory usage patterns
- **CPU**: Scale based on transcription/processing load

## Troubleshooting

### Common Issues

1. **Service Won't Start**:
   ```bash
   # Check logs for missing environment variables
   # Run health check locally first
   npm run build && npm start
   ```

2. **Redis Connection Failed**:
   ```bash
   # Verify REDIS_URL format
   rediss://default:password@host:port
   ```

3. **Health Check Failing**:
   ```bash
   # Test health endpoint locally
   curl http://localhost:3002/health
   ```

4. **Worker Not Processing Jobs**:
   ```bash
   # Check worker logs
   # Verify Redis connection
   # Monitor queue metrics
   ```

### Debug Commands

```bash
# Local health check
npm run build && node dist/utils/doctor.js

# Test Redis connection
node -e "
const { getRedisClient } = require('./dist/config/redis');
getRedisClient().healthCheck().then(console.log);
"

# Check environment variables
node -e "console.log(process.env.REDIS_URL ? 'Redis configured' : 'Redis missing')"
```

## Post-Deployment Checklist

### 1. Verify Services

- [ ] API service is running
- [ ] Worker service is running  
- [ ] Health checks passing
- [ ] Redis connection established

### 2. Test API Endpoints

```bash
# Replace with your actual domain
BASE_URL="https://your-app.onrender.com"

# Health check
curl $BASE_URL/health

# API documentation
curl $BASE_URL/api-docs

# Test authenticated endpoint (with valid API key)
curl -H "x-api-key: sk_test_..." $BASE_URL/api/v1/billing/plans
```

### 3. Configure Webhooks

Update webhook URLs in external services:

- **Stripe**: `https://your-app.onrender.com/api/v1/billing/webhook`
- **Your App**: Use generated webhook URLs for job completion

### 4. Monitor Initial Traffic

- Check Sentry for any errors
- Monitor `/metrics` for performance
- Verify queue processing in worker logs

## Security Considerations

### Environment Variables

- **Never commit secrets** to version control
- Use Render's environment variable encryption
- Rotate API keys regularly
- Use different keys for staging/production

### Network Security

- All traffic uses HTTPS by default on Render
- API key authentication required for all endpoints
- Rate limiting enabled (configurable via `API_RATE_LIMIT`)
- CORS configured for production domains

### Data Protection

- All media files stored in Cloudflare R2 (encrypted at rest)
- Temporary files cleaned up automatically
- User data isolated by tenant ID
- Payment data handled by Stripe (PCI compliant)

## Maintenance

### Regular Tasks

1. **Monitor Logs**: Check for errors and performance issues
2. **Update Dependencies**: Keep packages up to date
3. **Review Metrics**: Analyze usage patterns and scaling needs
4. **Backup Configuration**: Export environment variables periodically

### Updates & Rollbacks

- Render supports automatic deployments from GitHub
- Use staging environment for testing changes
- Render provides instant rollback capabilities
- Monitor health checks during deployments

## Support

For deployment issues:

1. Check Render logs first
2. Verify all environment variables are set
3. Test locally with production environment variables
4. Contact Render support for platform-specific issues

---

## Quick Reference

### Service URLs
- **API**: `https://your-app.onrender.com`
- **Health**: `https://your-app.onrender.com/health`
- **Docs**: `https://your-app.onrender.com/api-docs`
- **Metrics**: `https://your-app.onrender.com/metrics`

### Key Files
- `render.yaml` - Deployment configuration
- `src/index.ts` - API server entry point
- `src/worker.ts` - Background worker entry point
- `src/utils/doctor.ts` - Health check system
