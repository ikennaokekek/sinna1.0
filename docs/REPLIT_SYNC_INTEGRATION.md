# Replit Developer Portal Sync Integration

## Overview

The Render backend has been updated to support a new architecture where **Replit Developer Portal** handles Stripe checkout and customer onboarding, then syncs tenant and API key data to the Render backend via a secure sync endpoint.

## Architecture

### Flow Diagram

```
┌─────────────────┐
│  Customer       │
│  (Browser)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Replit Portal  │
│  - Stripe       │
│  - Checkout     │
│  - Customer DB  │
│  - API Key Gen  │
│  - Email Send   │
└────────┬────────┘
         │
         │ POST /v1/sync/tenant
         ▼
┌─────────────────┐
│  Render Backend │
│  - Tenant Store │
│  - API Key Auth │
│  - Video API    │
└─────────────────┘
```

### Responsibilities

**Replit Developer Portal:**
- ✅ Stripe Checkout Session creation
- ✅ Customer record creation
- ✅ API key generation and hashing (SHA-256)
- ✅ Email delivery via Resend
- ✅ Local storage in Replit DB
- ✅ Sync to Render backend

**Render Backend:**
- ✅ Tenant and API key storage
- ✅ API key authentication
- ✅ Video processing API execution
- ✅ Usage tracking and rate limiting

## New Endpoint

### `POST /v1/sync/tenant`

**Purpose:** Sync tenant and API key data from Replit to Render backend.

**Security:**
- Rate limited: 10 requests per minute per IP
- Origin validation: Shared secret (`REPLIT_SYNC_SECRET`) or IP allowlist (`REPLIT_IP_ALLOWLIST`)
- Bypasses standard API key auth (has its own security)

**Request Headers:**
```
Content-Type: application/json
X-Sync-Secret: <shared_secret> (if REPLIT_SYNC_SECRET is configured)
```

**Request Body:**
```json
{
  "tenantId": "tenant_xyz123",
  "email": "client@email.com",
  "hashed_api_key": "sha256_hashed_key_here",
  "plan": "standard",
  "subscription_status": "active",
  "expires_at": "2025-12-12T00:00:00.000Z",
  "stripe_customer_id": "cus_xxx", // optional
  "stripe_subscription_id": "sub_xxx" // optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tenant created successfully",
  "data": {
    "tenantId": "tenant_xyz123",
    "synced": true,
    "action": "created" // or "updated" or "skipped"
  }
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "validation_error",
  "message": "Invalid payload: email must be a valid email address"
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "unauthorized",
  "message": "Invalid sync secret"
}
```

**Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "rate_limited",
  "retry_after_seconds": 60
}
```

## Configuration

### Environment Variables

Add these to your Render environment variables:

#### Option 1: Shared Secret (Recommended)

```bash
REPLIT_SYNC_SECRET=your_secure_random_hex_string_here
```

Generate with:
```bash
openssl rand -hex 32
```

Replit must send this secret in the `X-Sync-Secret` header.

#### Option 2: IP Allowlist

```bash
REPLIT_IP_ALLOWLIST=1.2.3.4,5.6.7.8
```

Comma-separated list of Replit server IP addresses.

#### Webhook Handler Control

```bash
ENABLE_RENDER_CHECKOUT_HANDLER=false
```

- `false` (default): Replit handles checkout, Render only syncs
- `true`: Enable Render's checkout handler for backward compatibility

## Webhook Handler Changes

The `checkout.session.completed` webhook handler has been **deprioritized**:

- ✅ Still receives webhook events
- ✅ Logs the event for monitoring
- ⚠️ Only processes if `ENABLE_RENDER_CHECKOUT_HANDLER=true`
- 📝 Default behavior: Skip processing (handled by Replit)

This allows:
- Gradual migration
- Fallback if needed
- Monitoring of webhook delivery

## Database Schema

The sync endpoint uses existing tables:

### `tenants` table
- `id` (UUID) - Tenant ID from Replit
- `name` (TEXT) - Customer email
- `plan` (TEXT) - 'standard' or 'pro'
- `active` (BOOLEAN) - Derived from subscription_status
- `status` (TEXT) - 'active', 'inactive', 'expired', etc.
- `expires_at` (TIMESTAMPTZ) - Subscription expiration
- `stripe_customer_id` (TEXT) - Optional
- `stripe_subscription_id` (TEXT) - Optional

### `api_keys` table
- `key_hash` (TEXT) - SHA-256 hash of API key
- `tenant_id` (UUID) - Foreign key to tenants.id

## Sync Behavior

### Create vs Update

1. **New Tenant** (`action: "created"`):
   - Tenant ID doesn't exist
   - Creates new tenant record
   - Inserts API key

2. **Update Existing** (`action: "updated"`):
   - Tenant ID exists
   - Updates tenant fields (plan, status, expires_at, etc.)
   - Updates API key if changed

3. **Skip** (`action: "skipped"`):
   - Email exists with different tenantId
   - Prevents duplicate/conflicting records
   - Returns error response

### Duplicate Detection

The endpoint detects:
- ✅ Duplicate tenantId (updates existing)
- ✅ Duplicate email with different tenantId (skips, returns error)
- ✅ Duplicate API key hash (skips insert, continues)

## Logging and Diagnostics

All sync operations are logged:

```typescript
// Request received
req.log.info({
  tenantId,
  email,
  plan,
  subscription_status,
  source: 'replit_sync'
}, 'Received tenant sync request from Replit');

// Success
req.log.info({
  tenantId,
  email,
  action,
  subscription_status
}, 'Tenant sync completed successfully');

// Warnings
req.log.warn({
  existingTenantId,
  newTenantId,
  email
}, 'Duplicate email detected with different tenantId');
```

## Security Considerations

1. **Rate Limiting**: 10 requests/minute per IP (stricter than regular API)
2. **Origin Validation**: Shared secret or IP allowlist required
3. **Input Validation**: Zod schema validates all fields
4. **SQL Injection**: Parameterized queries prevent injection
5. **Transaction Safety**: All DB operations in transactions with rollback

## Testing

### Test Sync Request

```bash
curl -X POST https://sinna.site/v1/sync/tenant \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: your_secret_here" \
  -d '{
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test@example.com",
    "hashed_api_key": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    "plan": "standard",
    "subscription_status": "active",
    "expires_at": "2025-12-31T23:59:59.000Z"
  }'
```

### Verify in Database

```sql
-- Check tenant
SELECT * FROM tenants WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- Check API key
SELECT * FROM api_keys WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440000';
```

## Migration Checklist

- [ ] Add `REPLIT_SYNC_SECRET` or `REPLIT_IP_ALLOWLIST` to Render environment
- [ ] Set `ENABLE_RENDER_CHECKOUT_HANDLER=false` (default)
- [ ] Configure Replit to call `POST /v1/sync/tenant` after checkout
- [ ] Test sync endpoint with sample payload
- [ ] Monitor logs for sync operations
- [ ] Verify tenants and API keys are created correctly
- [ ] Test API key authentication with synced keys

## Troubleshooting

### Sync Request Rejected (401)

- Check `REPLIT_SYNC_SECRET` matches between Replit and Render
- Verify `X-Sync-Secret` header is sent
- Or check IP allowlist includes Replit server IP

### Rate Limited (429)

- Sync endpoint allows 10 requests/minute per IP
- Implement retry logic with exponential backoff
- Check `Retry-After` header for wait time

### Duplicate Email Error

- Email already exists with different tenantId
- Check existing tenant in database
- Resolve conflict manually or update Replit tenantId

### Database Errors

- Check Render logs for detailed error messages
- Verify database connection
- Check table schema matches expected structure

## Support

For issues or questions:
- Check Render logs: `apps/api/src/routes/sync.ts` logs all operations
- Review database: Verify tenant and API key records
- Test endpoint: Use curl or Postman to test sync manually

