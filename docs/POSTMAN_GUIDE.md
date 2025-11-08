# Sinna API - Postman Testing Guide

Complete guide for testing the Sinna API using Postman collections.

## 🚀 Quick Setup

### 1. Import Collection & Environment
1. **Download files**:
   - Collection: `postman/Sinna-API.postman_collection.json`
   - Environment: `postman/Sinna-API.postman_environment.json`

2. **Import into Postman**:
   - Open Postman
   - Click "Import" → Select both files
   - Choose "Sinna API Environment" from the environment dropdown

### 2. Configure Environment Variables
Update these variables in your Postman environment:

```
BASE_URL: https://your-app.onrender.com  (your actual domain)
API_KEY: sk_test_your_actual_api_key     (your real API key)
```

### 3. Test Authentication
Run the "Health Check" request first to verify your setup.

## 📋 Collection Structure

### 🏥 Health & Monitoring
- **Health Check** - System status (no auth required)
- **Ping** - Simple uptime check
- **Metrics** - Prometheus metrics
- **System Info** - Detailed system information

### 🎵 Audio Services
- **Transcribe Audio** - Convert speech to text
- **Generate Subtitles** - Create VTT/SRT/ASS files
- **Text to Speech** - Generate audio from text
- **Audio Descriptions** - Create timed accessibility audio
- **Available Voices** - List TTS voice options

### ♿ Accessibility Analysis
- **Color Analysis** - WCAG compliance checking
- **Accessibility Audit** - Comprehensive accessibility review
- **WCAG Guidelines** - Get accessibility standards

### ⚙️ Job Management
- **Queue Jobs** - Submit background processing tasks
- **Job Status** - Check processing progress
- **Queue Stats** - Monitor system performance

### 📁 Storage Management
- **Upload URLs** - Get signed URLs for file uploads
- **Download URLs** - Get signed URLs for file access
- **File Deletion** - Remove files from storage

### 💳 Billing & Subscriptions
- **Plans** - View subscription options ($2000/$3000 tiers)
- **Checkout** - Create payment sessions
- **Subscription Status** - Check current plan and usage
- **Customer Portal** - Self-service billing
- **Cancel Subscription** - Manage subscription lifecycle

## 🧪 Testing Workflows

### Basic API Testing
1. **Health Check** → Verify API is running
2. **Get Plans** → Check available subscriptions
3. **System Info** → Verify service status

### Audio Processing Workflow
1. **Transcribe Audio** → Test STT functionality
2. **Generate Subtitles** → Create subtitle files
3. **Text to Speech** → Test TTS functionality
4. **Get Voices** → Check available options

### Accessibility Testing
1. **Color Analysis** → Test video accessibility
2. **Accessibility Audit** → Comprehensive review
3. **Get Guidelines** → Reference WCAG standards

### Subscription Management
1. **Get Plans** → View pricing options
2. **Create Customer** → Set up billing
3. **Create Checkout** → Start subscription
4. **Get Status** → Check subscription details
5. **Customer Portal** → Self-service access

### Background Processing
1. **Queue Subtitle Job** → Submit async work
2. **Get Job Status** → Monitor progress
3. **Queue Stats** → System performance

## 🔧 Advanced Testing

### Environment Variables
Use these variables in your requests:

```
{{BASE_URL}} - API base URL
{{API_KEY}} - Your authentication key
{{JOB_ID}} - Job ID from queue responses
{{FILE_KEY}} - File key from storage responses
```

### Response Validation
All successful responses follow this format:
```json
{
  "success": true,
  "data": { ... },
  "message": "Description of operation"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

### Testing Different Scenarios

#### 1. Authentication Testing
- **Valid API Key**: Should return 200 with data
- **Invalid API Key**: Should return 401 Unauthorized
- **Missing API Key**: Should return 401 with AUTH_REQUIRED

#### 2. Rate Limiting
- Send multiple requests quickly
- Should receive 429 when limit exceeded
- Check rate limit headers in response

#### 3. Validation Testing
- Send invalid data formats
- Should receive 400 with validation details
- Test required vs optional fields

#### 4. Subscription Limits
- Exceed usage limits
- Should receive 429 with USAGE_LIMIT_EXCEEDED
- Test different plan limits

## 📊 Monitoring & Analytics

### Key Metrics to Track
- Response times for each endpoint
- Success/error rates
- Usage patterns by feature
- Queue processing times

### Health Check Interpretation
```json
{
  "status": "healthy",  // healthy, degraded, unhealthy
  "services": {
    "redis": { "status": "healthy" },
    "stripe": { "status": "healthy" },
    "sentry": { "status": "healthy" }
  }
}
```

### Error Code Reference
| Code | Meaning | Action |
|------|---------|--------|
| `AUTH_REQUIRED` | Missing API key | Add x-api-key header |
| `INVALID_API_KEY` | Bad key format | Use sk_ prefixed key |
| `SUBSCRIPTION_REQUIRED` | No active plan | Subscribe to a plan |
| `USAGE_LIMIT_EXCEEDED` | Monthly limit hit | Upgrade or wait |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement backoff |

## 🚨 Troubleshooting

### Common Issues

#### 1. "Connection refused"
- Check BASE_URL is correct
- Verify API is deployed and running
- Test /health endpoint first

#### 2. "401 Unauthorized"
- Verify API_KEY is set correctly
- Check key format (starts with sk_)
- Ensure key is active in your account

#### 3. "429 Rate Limited"
- Implement request throttling
- Check rate limit headers
- Consider upgrading plan

#### 4. "500 Internal Error"
- Check API health status
- Review error logs
- Contact support if persistent

### Debug Checklist
- [ ] Environment variables set correctly
- [ ] API key format is valid
- [ ] Request body is valid JSON
- [ ] Content-Type header is set
- [ ] BASE_URL includes protocol (https://)

## 🎯 Best Practices

### Request Optimization
1. **Batch Operations**: Use async jobs for large files
2. **Caching**: Store frequently accessed data
3. **Compression**: Use compressed media formats
4. **Webhooks**: Use callbacks instead of polling

### Error Handling
1. **Retry Logic**: Implement exponential backoff
2. **Graceful Degradation**: Handle service outages
3. **User Feedback**: Show meaningful error messages
4. **Logging**: Track API usage and errors

### Security
1. **API Key Protection**: Never expose in client code
2. **HTTPS Only**: Always use secure connections
3. **Input Validation**: Validate data before sending
4. **Rate Limiting**: Respect API limits

## 📈 Performance Testing

### Load Testing Scenarios
1. **Concurrent Transcriptions**: Multiple audio files
2. **Bulk Subtitle Generation**: Large batch processing
3. **High-frequency Requests**: Rate limit testing
4. **Mixed Workloads**: Different endpoint combinations

### Performance Benchmarks
- **Transcription**: ~1-2x real-time processing
- **Subtitle Generation**: ~30 seconds for 10-minute video
- **Color Analysis**: ~10-30 seconds per video
- **TTS Generation**: ~5-10 seconds per paragraph

## 🆘 Support Resources

### Documentation Links
- **Interactive API Docs**: `/api-docs`
- **Health Status**: `/health`
- **System Metrics**: `/metrics`

### Getting Help
1. Check health endpoint for system status
2. Review error codes and messages
3. Test with minimal request first
4. Check subscription limits and usage
5. Contact support with request/response details

---

**Happy testing! Make your streaming platform accessible to everyone.** 🌍
