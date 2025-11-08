# Sinna API Documentation

## Base URL
Production: `https://sinna.site`  
Development: `http://localhost:4000`

## Authentication

All API requests require authentication via the `X-API-Key` header:

```bash
curl -H "X-API-Key: sk_live_your_api_key" https://sinna.site/v1/demo
```

## Rate Limits

### Default Limits
- **120 requests per minute** per API key
- Rate limit headers included in all responses:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `Retry-After`: Seconds to wait before retrying (when rate limited)

### Rate Limit Responses
When rate limited, API returns:
```json
{
  "success": false,
  "error": "rate_limited",
  "retry_after_seconds": 60
}
```
Status code: `429 Too Many Requests`

### Bypassing Rate Limits
Rate limits are bypassed for:
- Requests from trusted CIDR blocks (configured via `TRUSTED_CIDRS`)
- Requests with valid HMAC signatures (configured via `WEBHOOK_SIGNING_SECRET`)
- Health check endpoints (`/health`, `/readiness`, `/metrics`)

## Usage Limits

### Per-Tenant Limits
Each tenant has monthly usage limits based on their plan:

**Standard Plan ($2,000/month):**
- Requests: Unlimited (subject to rate limits)
- Minutes processed: 1000 minutes/month (total video processing time)
- Jobs: 1000 jobs/month (any combination of caption/audio description/color analysis)
- Storage: 50GB/month (total storage used)

### Usage Gating
If usage limits are exceeded:
- API returns `429 Too Many Requests`
- Response includes reason:
```json
{
  "success": false,
  "error": "rate_limited",
  "reason": "minutes" // or "jobs", "storage"
}
```

### Checking Usage
```bash
GET /v1/me/usage
```

Response:
```json
{
  "success": true,
  "data": {
    "period_start": "2024-01-01T00:00:00Z",
    "period_end": "2024-01-31T23:59:59Z",
    "requests": 500,
    "minutes": 250,
    "jobs": 45,
    "storage": 2048000000,
    "cap": 100000
  }
}
```

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {}
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `unauthorized` | 401 | Missing or invalid API key |
| `payment_required` | 402 | Subscription inactive or expired |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `rate_limited` | 429 | Rate limit or usage limit exceeded |
| `validation_error` | 400 | Invalid request parameters |
| `stripe_unconfigured` | 503 | Stripe not configured |
| `missing_price` | 503 | Stripe price ID missing |
| `stripe_error` | 500 | Stripe API error |
| `internal_error` | 500 | Internal server error |
| `tenant_not_found` | 404 | Tenant not found |

## Endpoints

### Health & Status

#### GET /health
Health check endpoint.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "ok": true,
  "uptime": 12345.67
}
```

#### GET /readiness
Readiness probe for Kubernetes/Render.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "db": "up"
}
```

#### GET /metrics
Prometheus metrics endpoint (no authentication required).

### Jobs

#### POST /v1/jobs
Create a new job.

**Headers:**
- `X-API-Key`: Required

**Body:**
```json
{
  "source_url": "https://example.com/video.mp4",
  "preset_id": "everyday" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-123",
    "steps": {
      "captions": "caption-job-123",
      "ad": "ad-job-123",
      "color": "color-job-123"
    },
    "preset": "everyday"
  },
  "message": "Pipeline queued"
}
```

**Status Codes:**
- `201 Created`: Job created successfully
- `429 Too Many Requests`: Usage limit exceeded
- `400 Bad Request`: Invalid request body

#### GET /v1/jobs/:id
Get job status.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-123",
    "status": {
      "captions": "completed",
      "ad": "pending",
      "color": "pending"
    },
    "artifacts": [
      {
        "type": "subtitles",
        "format": "vtt",
        "url": "https://...",
        "key": "subtitles/vtt/job-123.vtt"
      }
    ],
    "exportPackUrl": "https://..."
  }
}
```

**Status Values:**
- `completed`: Step completed successfully
- `failed`: Step failed
- `pending`: Step not yet started or in progress

### Billing

#### POST /v1/billing/subscribe
Create Stripe checkout session for subscription.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://checkout.stripe.com/..."
  }
}
```

**Status Codes:**
- `200 OK`: Checkout session created
- `503 Service Unavailable`: Stripe not configured

### Subscription

#### GET /v1/me/subscription
Get current subscription details.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "active",
    "plan": "standard",
    "stripe_customer_id": "cus_...",
    "stripe_subscription_id": "sub_...",
    "active": true,
    "grace_until": null,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Status Values:**
- `active`: Subscription is active
- `cancelled`: Subscription cancelled
- `past_due`: Payment overdue but in grace period
- `unpaid`: Payment failed
- `trialing`: In trial period
- `unknown`: Status cannot be determined

### Usage

#### GET /v1/me/usage
Get current usage statistics.

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "data": {
    "period_start": "2024-01-01T00:00:00Z",
    "period_end": "2024-01-31T23:59:59Z",
    "requests": 500,
    "minutes": 250,
    "jobs": 45,
    "storage": 2048000000,
    "cap": 100000
  }
}
```

### Files

#### GET /v1/files/:id:sign
Generate signed URL for file access.

**Headers:**
- `X-API-Key`: Required

**Query Parameters:**
- `ttl` (optional): Time-to-live in seconds (max 86400, default 3600)

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://...",
    "expires_in": 3600
  }
}
```

## Webhooks

### Stripe Webhooks

#### POST /webhooks/stripe
Stripe webhook endpoint (no authentication required, uses Stripe signature verification).

**Headers:**
- `stripe-signature`: Stripe webhook signature

**Supported Events:**
- `checkout.session.completed`: New subscription created
- `invoice.payment_succeeded`: Payment successful
- `invoice.payment_failed`: Payment failed
- `customer.subscription.deleted`: Subscription cancelled
- `customer.subscription.updated`: Subscription updated

**Response:**
```json
{
  "received": true
}
```

**Webhook Processing:**
1. Verifies Stripe signature
2. Creates/updates tenant record
3. Generates API key (for new subscriptions)
4. Sends email notifications
5. Updates tenant status

## Request ID Tracking

All requests include a `X-Request-ID` header in the response. Use this ID when reporting issues or debugging.

## Interactive API Documentation

Swagger UI is available at: `/api-docs`

Visit `https://sinna.site/api-docs` for interactive API documentation.

## SDKs

### JavaScript/TypeScript
```bash
npm install @sinna/sdk-js
```

```javascript
import { SinnaClient } from '@sinna/sdk-js';

const client = new SinnaClient({
  apiKey: 'sk_live_your_api_key',
  baseUrl: 'https://sinna.site'
});

const job = await client.jobs.create({
  source_url: 'https://example.com/video.mp4'
});
```

## Support

- **API Status:** https://status.sinna.com
- **Documentation:** https://docs.sinna.com
- **Support Email:** motion24inc@gmail.com
