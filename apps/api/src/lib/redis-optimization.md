# Redis Optimization Guide

## Current TTL Strategy

### Idempotency Keys
- **TTL:** 24 hours (86400 seconds)
- **Reason:** Job results should be cacheable for 24 hours to prevent duplicate processing
- **Optimization:** Consider reducing to 12 hours if storage is a concern

### Rate Limiting
- **TTL:** Managed by rate-limiter-flexible (sliding window)
- **Current:** 60 seconds window
- **Optimization:** Already optimal for rate limiting

## Cache Warming Strategy

### Recommended Cache Warming
1. **Tenant Data:** Warm cache on startup for active tenants
2. **Usage Counters:** Pre-load current month's usage for active tenants
3. **Job Status:** Keep completed jobs cached for 1 hour

## Memory Optimization

### Key Prefixes
- `jobs:idempotency:` - Job idempotency keys
- `rlf:global:` - Rate limiter keys
- `rlf:webhook:` - Webhook rate limiter keys

### Estimated Memory Usage
- Idempotency keys: ~500 bytes each (JSON job bundle)
- Rate limiter keys: ~100 bytes each
- Recommended Redis instance: 256MB minimum for production

