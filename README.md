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
- **API**: Express.js with TypeScript
- **Queue**: BullMQ with Redis
- **Storage**: Cloudflare R2 + signed URLs
- **Monitoring**: Sentry + Prometheus metrics
- **Deployment**: Render.com ready

## 🏗️ Architecture

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

### Standard - $1,500/month
- 50,000 API requests
- 2,500 transcription minutes
- 1,250 audio description minutes
- 2,000 color analysis requests
- Full webhook support

### Gold - $3,000/month
- 150,000 API requests
- 7,500 transcription minutes
- 3,750 audio description minutes
- 6,000 color analysis requests
- Priority support + custom branding

## 🔧 API Endpoints

### Authentication
All endpoints require API key authentication:
```bash
curl -H "x-api-key: sk_your_api_key" \
  https://api.sinna.com/v1/endpoint
```

### Core Endpoints
- `POST /v1/audio/transcribe` - Transcribe audio to text
- `POST /v1/audio/generate-subtitles` - Generate subtitle files
- `POST /v1/audio/audio-description` - Create audio descriptions
- `POST /v1/accessibility/color-analysis` - Analyze video colors
- `POST /v1/jobs/subtitles` - Queue subtitle generation job

### Billing & Management
- `GET /api/v1/billing/plans` - Available subscription plans
- `POST /api/v1/billing/checkout` - Create checkout session
- `GET /api/v1/billing/subscription` - Current subscription status
- `POST /api/v1/billing/portal` - Customer portal access

### Monitoring
- `GET /health` - System health check
- `GET /metrics` - Prometheus metrics
- `GET /api-docs` - Interactive API documentation

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
# Media Processing
CLOUDINARY_URL=cloudinary://key:secret@cloud

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

### Key Metrics
- API request rates and latency
- Transcription processing times
- Queue depth and job completion rates
- Subscription usage and billing events
- Error rates and system health

## 🔒 Security

- **API Key Authentication**: Secure tenant isolation
- **Rate Limiting**: Configurable per-tenant limits
- **Usage Tracking**: Fair-use enforcement
- **Data Encryption**: All data encrypted at rest and in transit
- **PCI Compliance**: Payment processing via Stripe

## 📚 Documentation

- **API Documentation**: Available at `/api-docs`
- **Deployment Guide**: See `docs/DEPLOYMENT.md`
- **Configuration**: See `docs/SECRETS.md`
- **Postman Collection**: Generated automatically

## 🧪 Testing

```bash
# Unit tests
npm test

# E2E tests (requires running server)
E2E_BASE_URL=http://localhost:3002 npm run test:e2e

# Health check
curl http://localhost:3002/health
```

## 🤝 Support

### Getting Help
1. Check the `/health` endpoint for system status
2. Review logs for specific error messages
3. Consult the API documentation at `/api-docs`
4. Monitor usage and limits in your dashboard

### Common Issues
- **Authentication**: Ensure API key starts with `sk_`
- **Rate Limits**: Check subscription plan limits
- **Queue Processing**: Verify Redis connection and worker status
- **Media Processing**: Confirm storage and AI service credentials

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
