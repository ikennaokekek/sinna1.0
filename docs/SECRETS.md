# Sinna API - Environment Variables & Secrets

This document lists environment variables required by the system. Do not commit real secrets here.

## Required Environment Variables

### CHECKPOINT 1 - Cloudflare R2 Storage
```bash
R2_ACCOUNT_ID=__R2_ACCOUNT_ID__
R2_ACCESS_KEY_ID=__R2_ACCESS_KEY_ID__
R2_SECRET_ACCESS_KEY=__R2_SECRET_ACCESS_KEY__
R2_BUCKET=sinna1-0
```

### CHECKPOINT 2 - Upstash Redis
```bash
REDIS_URL=rediss://default:__TOKEN__@__HOST__:6379
```

### CHECKPOINT 3 - Cloudinary
```bash
CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@<cloud_name>
```

### CHECKPOINT 4 - STT/TTS Services
```bash
ASSEMBLYAI_API_KEY=your-assemblyai-key
OPENAI_API_KEY=sk-...

# AI Provider Configuration
PROVIDER_CAPTIONS=assemblyai_realtime  # live
PROVIDER_TTS=openai
PROVIDER_CAPTIONS_VOD=whisper          # batch fallback
```

### CHECKPOINT 5 - Stripe Payment Processing
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### CHECKPOINT 6 - Monitoring & Analytics
```bash
SENTRY_DSN=https://<public_key>@sentry.io/<project_id>
GRAFANA_PROM_PUSH_URL=  # Optional
```

## Server Configuration
```bash
PORT=4000
NODE_ENV=development
BASE_URL=http://localhost:4000 , https://sinna1-0.onrender.com
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DB
JWT_SECRET=your-super-secret-jwt-key-here
API_RATE_LIMIT=100
```

## Phase 2 Feature Flags
```bash
FEATURE_REALTIME=0
GPU_PROVIDER=none
```

## Setup Instructions

1. Copy `env.example` to `.env`
2. Fill in the required values per environment (local, staging, prod)
3. For production, set all secrets in your hosting platform (Render) only
4. Never commit `.env` files or real credentials to version control

## Security Notes

- Keep API keys secure and rotate regularly
- Use different keys for development, staging, and production
- Monitor usage and set up alerts for unusual activity
- Enable webhook signature verification for all external services
