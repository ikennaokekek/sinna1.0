# Sinna API - Environment Variables & Secrets

This document contains all the environment variables and secrets needed to run the Sinna API.

## Required Environment Variables

### CHECKPOINT 1 - Cloudflare R2 Storage
```bash
R2_ACCOUNT_ID=df7855d26a40bad170d0ad63c971c168
R2_ACCESS_KEY_ID=2805e41f04f4f72992872ce8cd0941e5
R2_SECRET_ACCESS_KEY=a5b80e55be0a618389c32c03db5784b2350e2593515b16bc086578c579f15721
R2_BUCKET=sinna1-0
```

### CHECKPOINT 2 - Upstash Redis
```bash
REDIS_URL=rediss://default:AWMYAAIncDFjZGEwYTJlMGJlMjU0YzkzYjdkYjZmYmNhYmViM2VlNnAxMjUzNjg@good-owl-25368.upstash.io:6379
```

### CHECKPOINT 3 - Cloudinary
```bash
CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@dhumkzsdp
```

### CHECKPOINT 4 - STT/TTS Services
```bash
ASSEMBLYAI_API_KEY=e3c8fabeb964421bb79ce122c700b711
OPENAI_API_KEY=your_openai_api_key_here

# AI Provider Configuration
PROVIDER_CAPTIONS=assemblyai_realtime  # live
PROVIDER_TTS=openai
PROVIDER_CAPTIONS_VOD=whisper          # batch fallback
```

### CHECKPOINT 5 - Stripe Payment Processing
```bash
STRIPE_SECRET_KEY=sk_live_[REDACTED]
STRIPE_WEBHOOK_SECRET=whsec_NICA0vE1A2GuAoo7o7YRhq04rEeEK66N
```

### CHECKPOINT 6 - Monitoring & Analytics
```bash
SENTRY_DSN=https://a7b2f95a71fdc2aa9380b3f6230d846b@o4510008512544768.ingest.de.sentry.io/4510008525193296
GRAFANA_PROM_PUSH_URL=  # Optional
```

## Server Configuration
```bash
PORT=3002
NODE_ENV=development
BASE_URL=http://localhost:3002
DATABASE_URL=postgresql://user:password@localhost:5432/sinna_db
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
2. Fill in the required values for each checkpoint as you progress
3. For production deployment, ensure all secrets are properly configured in your hosting platform
4. Never commit `.env` files to version control

## Security Notes

- All API keys should be kept secure and rotated regularly
- Use different keys for development, staging, and production environments
- Monitor usage and set up alerts for unusual activity
- Enable webhook signature verification for all external services
