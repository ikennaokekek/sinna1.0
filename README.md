# Sinna API 🎬

Advanced accessibility features API for streaming platforms worldwide. Sinna provides comprehensive tools for subtitle generation, audio descriptions, color analysis, and accessibility compliance.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Redis (Upstash recommended)
- Cloudflare R2 storage account

### Installation
```bash
git clone <your-repo>
cd SINNA1.0
npm install
cp env.example .env
# Configure your environment variables
npm run build
npm start
```

### Development
```bash
npm run dev          # Start API server
npm run dev:worker   # Start background worker
npm test            # Run tests
npm run test:e2e    # Run E2E tests
```

## 📋 Features

### Core Accessibility Services
- **🎯 Subtitle Generation**: AI-powered subtitle creation in VTT, SRT, ASS formats
- **🔊 Audio Descriptions**: Generate audio descriptions for visual content
- **🎨 Color Analysis**: WCAG compliance checking and accessibility scoring
- **📝 Transcription**: Multi-provider STT with AssemblyAI and OpenAI Whisper

### Enterprise Features
- **💳 Subscription Management**: Stripe-powered billing with usage tracking
- **🔑 API Key Authentication**: Secure access with tenant isolation
- **📊 Usage Analytics**: Comprehensive metrics and monitoring
- **🚀 Auto-scaling**: Queue-based processing with BullMQ

### Technical Stack
- **API**: Fastify with TypeScript
- **Queue**: BullMQ with Redis
- **Storage**: Cloudflare R2 + signed URLs
- **Monitoring**: Sentry + Prometheus metrics
- **Deployment**: Render.com ready

## 🏗️ Architecture

Note: The `archive/express` directory contains a deprecated Express implementation kept for reference. The live production stack uses Fastify in `apps/api` and BullMQ worker in `apps/worker`.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│  Sinna API  │───▶│   Worker    │
│ (Streaming  │    │             │    │ (Processing)│
│  Platform)  │    │ • Auth      │    │ • STT/TTS   │
└─────────────┘    │ • Billing   │    │ • Analysis  │
                   │ • Queue     │    │ • Storage   │
                   └─────────────┘    └─────────────┘
                          │                   │
                          └───────────────────┘
                                     │
                            ┌─────────────┐
                            │   Redis     │
                            │  (Queue)    │
                            └─────────────┘
```

## 💰 Subscription Plans

### Standard - $2,000/month
- 1,000 jobs per month (any combination)
- 1,000 minutes processed per month
- 50GB storage per month
- Full webhook support
- Rate limit: 120 requests/minute

### Pro - $5,000/month
- 10,000 jobs per month (any combination)
- 10,000 minutes processed per month
- 500GB storage per month
- Full webhook support
- Rate limit: 120 requests/minute
- Priority support

### Enterprise - Custom Pricing
- Unlimited jobs per month
- Unlimited minutes processed per month
- Unlimited storage per month
- Full webhook support
- Rate limit: 120 requests/minute
- Custom branding + dedicated support

## 🔧 API Endpoints

### Authentication
Most endpoints require API key authentication via the `x-api-key` header:
```bash
curl -H "x-api-key: sk_your_api_key" \
  https://sinna.site/v1/jobs
```

Public endpoints (no auth required):
- `GET /health` - Health check
- `GET /v1/demo` - Demo endpoint

### Core Endpoints
- `POST /v1/jobs` - Create a job pipeline (captions + audio description + color analysis)
- `GET /v1/jobs/:id` - Get job status and results
- `GET /v1/me/usage` - Get current usage statistics
- `GET /v1/me/subscription` - Get current subscription status
- `GET /v1/files/:id/sign` - Get signed URL for artifact download

### Billing & Management
- `POST /v1/billing/subscribe` - Create Stripe checkout session
- `GET /v1/me/subscription` - Current subscription status
- `POST /webhooks/stripe` - Stripe webhook endpoint (handles subscription events)

### Monitoring & Health
- `GET /health` - System health check (all services)
- `GET /readiness` - Readiness probe (database only)
- `GET /metrics` - Prometheus metrics
- `GET /api-docs` - Interactive API documentation (Swagger UI)
- `GET /v1/demo` - Demo endpoint (no auth required)

## 🛠️ Configuration

### Required Environment Variables
```bash
# Redis & Storage
REDIS_URL=rediss://your-redis-url
R2_ACCOUNT_ID=your-r2-account
R2_ACCESS_KEY_ID=your-r2-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET=your-bucket

# AI Services (choose one or both)
ASSEMBLYAI_API_KEY=your-assemblyai-key
OPENAI_API_KEY=your-openai-key

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Optional Configuration
```bash
# Media Processing (Optional - for advanced video color analysis)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# Monitoring
SENTRY_DSN=https://...@sentry.io/...

# Provider Selection
PROVIDER_CAPTIONS=assemblyai_realtime
PROVIDER_TTS=openai
PROVIDER_CAPTIONS_VOD=whisper
```

## 🚀 Deployment

### Deploy to Render (Recommended)
1. Connect your GitHub repository to Render
2. Configure environment variables in Render dashboard
3. Deploy using the included `render.yaml`

```bash
# The render.yaml automatically configures:
# - API service (web)
# - Worker service (background)
# - Auto-scaling
# - Health checks
```

### Manual Deployment
```bash
npm run build
npm start              # API server
npm run start:worker   # Background worker
```

## 📊 Monitoring & Analytics

### Built-in Monitoring
- **Health Checks**: `/health` endpoint with service status
- **Metrics**: Prometheus metrics at `/metrics`
- **Error Tracking**: Sentry integration
- **Usage Analytics**: Per-tenant usage tracking

### Self-Healing QA Automation ✅
**SINNA 1.0 includes a self-healing QA suite that auto-detects and fixes pipeline failures across all accessibility presets.**

- **Automated Testing**: End-to-end validation of all 8 video transformation presets (blindness, deaf, color_blindness, adhd, autism, epilepsy_flash, epilepsy_noise, cognitive_load)
- **Auto-Healing**: Automatically detects and fixes configuration issues in real-time
- **Watchdog Service**: Continuous log monitoring that triggers auto-healing when errors are detected
- **Comprehensive Reports**: Detailed markdown reports generated after each test run
- **Production Resilience**: Ensures pipeline stability and accessibility compliance

**Key Features:**
- ✅ Tests all video transformation presets automatically
- ✅ Validates queue→worker→R2 flow end-to-end
- ✅ Auto-fixes missing configurations (videoTransform flags, config objects)
- ✅ Monitors Render logs every 10 minutes for recurring errors
- ✅ Generates detailed reports for audit and debugging

See `tests/AUTOHEAL_README.md` and `scripts/WATCHDOG_README.md` for complete documentation.

### Key Metrics
- API request rates and latency
- Job processing times (captions, audio description, color analysis)
- Queue depth and job completion rates
- Subscription usage and billing events
- Error rates and system health
- Per-tenant usage tracking (minutes, jobs, storage)

## 🔒 Security

- **API Key Authentication**: Secure tenant isolation
- **Rate Limiting**: Configurable per-tenant limits
- **Usage Tracking**: Fair-use enforcement
- **Data Encryption**: All data encrypted at rest and in transit
- **PCI Compliance**: Payment processing via Stripe

## 📚 Documentation

- **API Documentation**: Available at `/api-docs` or `https://sinna.site/api-docs`
- **Customer Onboarding**: See `docs/CUSTOMER_ONBOARDING.md`
- **Terms of Service**: See `docs/TERMS_OF_SERVICE.md`
- **Privacy Policy**: See `docs/PRIVACY_POLICY.md`
- **Deployment Guide**: See `docs/DEPLOYMENT.md`
- **Configuration**: See `docs/SECRETS.md`
- **Postman Collection**: Generated automatically

## 🧪 Testing

```bash
# Unit tests
npm test

# E2E tests (requires running server)
E2E_BASE_URL=http://localhost:4000 npm run test:e2e

# Auto-healing QA suite
npm run test:heal

# Watchdog service (monitors logs and triggers auto-healing)
npm run watchdog

# Health check
curl http://localhost:4000/health
```

### QA Automation & Self-Healing ✅
**QA automation and self-healing complete.** SINNA 1.0 includes a comprehensive self-healing QA suite that auto-detects and fixes pipeline failures across all accessibility presets, ensuring stability and resilience in production.

## 🤝 Support

### Getting Help
1. Check the `/health` endpoint for system status
2. Review logs for specific error messages
3. Consult the API documentation at `/api-docs`
4. Monitor usage and limits in your dashboard

### Common Issues
- **Authentication**: Ensure API key starts with `sk_` and is included in `x-api-key` header
- **Rate Limits**: Check subscription plan limits (120 requests/minute global limit)
- **Usage Limits**: Monitor `/v1/me/usage` for current usage against plan limits (minutes, jobs, storage)
- **Queue Processing**: Verify Redis connection and worker status
- **Media Processing**: Confirm storage (R2) and AI service credentials (AssemblyAI, OpenAI)
- **Cloudinary**: Optional - only needed for advanced video color analysis

## 📈 Roadmap

### Phase 1 (Current)
- ✅ Core accessibility APIs
- ✅ Subscription billing
- ✅ Multi-provider AI integration
- ✅ Production deployment

### Phase 2 (Planned)
- 🔄 Real-time caption streaming
- 🔄 GPU-accelerated processing
- 🔄 Advanced analytics dashboard
- 🔄 Multi-language support expansion

## 📄 License

MIT License - see LICENSE file for details.

---

**Built for streaming platforms worldwide** 🌍

*Sinna makes video content accessible to everyone, everywhere.*
