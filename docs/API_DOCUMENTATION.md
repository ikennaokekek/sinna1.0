# Sinna API Documentation

Complete API documentation for the Sinna accessibility features API.

## 🚀 Getting Started

### Base URL
```
Production: https://your-app.onrender.com
Local: http://localhost:4000
```

### Authentication
All API requests require authentication using an API key in the header:
```bash
x-api-key: sk_your_api_key_here
```

### Response Format
All responses follow this structure:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

## 📚 Interactive Documentation

### Swagger UI
Access the interactive API documentation at:
- **Production**: `https://your-app.onrender.com/api-docs`
- **Local**: `http://localhost:4000/api-docs`

The Swagger UI provides:
- ✅ Interactive API testing
- ✅ Request/response examples
- ✅ Schema validation
- ✅ Authentication testing
- ✅ Real-time API exploration

### Postman Collection
Import the Postman collection for easy testing:
1. Download: `postman/Sinna-API.postman_collection.json`
2. Import into Postman
3. Set up environment variables
4. Start testing!

## 🎯 Core Endpoints

### Health & Monitoring
- `GET /health` - System health check
- `GET /ping` - Simple uptime check
- `GET /metrics` - Prometheus metrics
- `GET /v1/monitoring/system` - System information

### Audio Services
- `POST /v1/audio/transcribe` - Transcribe audio to text
- `POST /v1/audio/generate-subtitles` - Generate subtitle files
- `POST /v1/audio/text-to-speech` - Convert text to speech
- `POST /v1/audio/audio-description` - Generate audio descriptions
- `GET /v1/audio/voices` - List available TTS voices

### Accessibility Analysis
- `POST /v1/accessibility/color-analysis` - Analyze video colors
- `POST /v1/accessibility/audit` - Comprehensive accessibility audit
- `GET /v1/accessibility/guidelines` - WCAG guidelines

### Job Management
- `POST /v1/jobs/subtitles` - Queue subtitle generation
- `POST /v1/jobs/audio-description` - Queue audio description
- `GET /v1/jobs/{queueName}/{jobId}` - Get job status
- `GET /v1/jobs/stats` - Queue statistics

### Storage Management
- `POST /v1/storage/upload-url` - Generate upload URL
- `POST /v1/storage/download-url` - Generate download URL
- `DELETE /v1/storage/{key}` - Delete file

### Billing & Subscriptions
- `GET /v1/billing/plans` - Available subscription plans
- `POST /v1/billing/checkout` - Create checkout session
- `GET /v1/billing/subscription` - Subscription status
- `POST /v1/billing/portal` - Customer portal
- `POST /v1/billing/cancel` - Cancel subscription

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

## 🔧 Usage Examples

### Basic Transcription
```bash
curl -X POST "https://your-app.onrender.com/v1/audio/transcribe" \
  -H "x-api-key: sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "audioUrl": "https://example.com/audio.mp3",
    "language": "en",
    "includeWordTimestamps": true
  }'
```

### Generate Subtitles
```bash
curl -X POST "https://your-app.onrender.com/v1/audio/generate-subtitles" \
  -H "x-api-key: sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "audioUrl": "https://example.com/audio.mp3",
    "language": "en",
    "format": "vtt"
  }'
```

### Color Analysis
```bash
curl -X POST "https://your-app.onrender.com/v1/accessibility/color-analysis" \
  -H "x-api-key: sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "frameCount": 5
  }'
```

### Create Subscription
```bash
curl -X POST "https://your-app.onrender.com/v1/billing/checkout" \
  -H "x-api-key: sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "standard",
    "successUrl": "https://your-app.com/success",
    "cancelUrl": "https://your-app.com/cancel"
  }'
```

## 🔒 Authentication & Security

### API Key Format
- Format: `sk_test_` or `sk_live_` followed by alphanumeric characters
- Include in header: `x-api-key: your_key_here`
- Keys are tenant-specific and track usage

### Rate Limiting
- Default: 1000 requests per minute per API key
- Rate limit headers included in responses
- 429 status code when limit exceeded

### Security Features
- HTTPS only in production
- API key validation and tenant isolation
- Usage tracking and fair-use enforcement
- Webhook signature verification
- Input validation and sanitization

## 📊 Monitoring & Analytics

### Health Monitoring
```bash
# Quick health check
curl https://your-app.onrender.com/health

# Detailed system info (requires API key)
curl -H "x-api-key: sk_your_key" \
  https://your-app.onrender.com/v1/monitoring/system
```

### Prometheus Metrics
```bash
# Get metrics for monitoring
curl https://your-app.onrender.com/metrics
```

Key metrics available:
- API request rates and latency
- Queue job processing times
- Subscription usage by tenant
- Error rates and system health
- Storage operations and usage

## 🚨 Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_REQUIRED` | Missing API key | Include `x-api-key` header |
| `INVALID_API_KEY` | Invalid key format | Use valid `sk_` prefixed key |
| `SUBSCRIPTION_REQUIRED` | No active subscription | Subscribe to a plan |
| `USAGE_LIMIT_EXCEEDED` | Monthly limit reached | Upgrade plan or wait for reset |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry |
| `VALIDATION_FAILED` | Invalid request data | Check request format |
| `INTERNAL_ERROR` | Server error | Contact support |

## 🔄 Webhooks

### Webhook URLs
Configure webhook URLs to receive job completion notifications:

```json
{
  "jobId": "subtitle-tenant123-1234567890",
  "status": "completed",
  "result": {
    "subtitleUrl": "https://storage.url/subtitle.vtt",
    "duration": 120,
    "confidence": 0.95
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Webhook Security
- Signature verification using webhook secret
- HTTPS required for webhook URLs
- Retry logic with exponential backoff
- 30-second timeout per webhook call

## 📈 Best Practices

### Performance Optimization
1. **Batch Requests**: Use async jobs for large files
2. **Caching**: Cache frequently accessed content
3. **Compression**: Use compressed audio formats
4. **Webhooks**: Use webhooks instead of polling for job status

### Error Handling
1. **Retry Logic**: Implement exponential backoff
2. **Graceful Degradation**: Handle service outages
3. **Validation**: Validate inputs before API calls
4. **Monitoring**: Track API usage and errors

### Security Best Practices
1. **API Key Security**: Never expose keys in client-side code
2. **HTTPS Only**: Always use HTTPS in production
3. **Input Validation**: Validate all user inputs
4. **Rate Limiting**: Respect rate limits and implement backoff

## 🆘 Support & Resources

### Documentation Links
- **Swagger UI**: `/api-docs`
- **Health Check**: `/health`
- **Metrics**: `/metrics`
- **Postman Collection**: `postman/Sinna-API.postman_collection.json`

### Getting Help
1. Check the health endpoint for system status
2. Review error codes and messages
3. Consult the interactive API documentation
4. Test with Postman collection
5. Monitor usage and limits in your dashboard

### Common Integration Patterns
- **Real-time Subtitles**: Use immediate transcription endpoints
- **Batch Processing**: Queue jobs with webhook notifications
- **Accessibility Compliance**: Regular color analysis audits
- **Multi-language Support**: Specify language codes in requests

---

**Ready to make your streaming platform accessible to everyone!** 🌍
