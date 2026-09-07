# ✅ `/v1/sync/tenant` Endpoint Status

## ✅ Endpoint Already Exists!

The `/v1/sync/tenant` endpoint is **already implemented and registered** in your Render backend.

---

## 📍 Location

- **File:** `apps/api/src/routes/sync.ts`
- **Endpoint:** `POST /v1/sync/tenant`
- **Registered:** `apps/api/src/index.ts` (line 545)
- **Auth Bypass:** `apps/api/src/index.ts` (line 165) - Excluded from API key auth

---

## ✅ Current Configuration

### Security
- ✅ **Shared Secret**: `REPLIT_SYNC_SECRET` environment variable
- ✅ **Rate Limiting:** 10 requests per minute per IP
- ✅ **Input Validation:** Zod schema validates all fields

### Features
- ✅ Creates/updates tenant records
- ✅ Stores API key hash
- ✅ Handles duplicate detection
- ✅ Transaction-safe database operations
- ✅ Comprehensive logging

---

## 🔧 Configuration Required

### Shared Secret

**In your encrypted environment configuration:**

Add:
```
REPLIT_SYNC_SECRET=<ONBOARDING_SYNC_SHARED_SECRET>
```

**Generate secret:**
```bash
openssl rand -hex 32
```

**The onboarding service must send this header:**
```
X-Sync-Secret: <ONBOARDING_SYNC_SHARED_SECRET>
```

---

## 📋 Endpoint Details

### Request

**URL:** `POST https://sinna1-0.onrender.com/v1/sync/tenant`

**Headers:**
```
Content-Type: application/json
X-Sync-Secret: <shared_secret> (if REPLIT_SYNC_SECRET is configured)
```

**Body:**
```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "client@example.com",
  "hashed_api_key": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "plan": "standard",
  "subscription_status": "active",
  "expires_at": "2025-12-31T23:59:59.000Z",
  "stripe_customer_id": "cus_xxx", // optional
  "stripe_subscription_id": "sub_xxx" // optional
}
```

### Response (200 OK)
```json
{
  "success": true,
  "message": "Tenant created successfully",
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "synced": true,
    "action": "created" // or "updated" or "skipped"
  }
}
```

### Response (401 Unauthorized)
```json
{
  "success": false,
  "error": "unauthorized",
  "message": "Invalid sync secret"
}
```

---

## 🧪 Testing

### Test with curl

```bash
curl -X POST https://sinna1-0.onrender.com/v1/sync/tenant \
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

---

## 📊 Monitoring

### Check Render Logs

Search for:
- `"Tenant sync completed"`
- `"Sync request rejected: unauthorized service"`

---

## ✅ Verification Checklist

- [x] Endpoint exists (`/v1/sync/tenant`)
- [x] Registered in app
- [x] Bypasses API key auth
- [x] Has shared-secret authentication
- [x] Has rate limiting
- [ ] `REPLIT_SYNC_SECRET` configured in both services' encrypted environment configuration
- [ ] Onboarding configured to call this endpoint after provisioning

---

## 🚀 Next Steps

1. **Configure security**:
    - Add the same `REPLIT_SYNC_SECRET` to Core and the onboarding service
   
2. **Configure the onboarding service** to:
    - Call `/v1/sync/tenant` after provisioning
    - Send the `X-Sync-Secret` header
   - Include all required fields in payload

3. **Test the endpoint**:
   - Use curl or Postman
   - Verify tenant is created in database
   - Check logs for success/errors

---

**The endpoint is ready! Just needs security configuration in Render and Replit integration.**

