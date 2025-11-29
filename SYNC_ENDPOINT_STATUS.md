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
- ✅ **Shared Secret** (Option 1): `REPLIT_SYNC_SECRET` environment variable
- ✅ **IP Allowlist** (Option 2): `REPLIT_IP_ALLOWLIST` environment variable
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

### Option 1: Shared Secret (Recommended)

**In Render Dashboard → Environment:**

Add:
```
REPLIT_SYNC_SECRET=your_secure_random_hex_string_here
```

**Generate secret:**
```bash
openssl rand -hex 32
```

**Replit must send this in header:**
```
X-Sync-Secret: your_secure_random_hex_string_here
```

---

### Option 2: IP Allowlist

**In Render Dashboard → Environment:**

Add:
```
REPLIT_IP_ALLOWLIST=1.2.3.4,5.6.7.8
```

(Comma-separated list of Replit server IP addresses)

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
- `"Received tenant sync request from Replit"`
- `"Tenant sync completed successfully"`
- `"Sync request rejected: invalid origin"`

---

## ✅ Verification Checklist

- [x] Endpoint exists (`/v1/sync/tenant`)
- [x] Registered in app
- [x] Bypasses API key auth
- [x] Has security (shared secret or IP allowlist)
- [x] Has rate limiting
- [ ] `REPLIT_SYNC_SECRET` configured in Render (if using shared secret)
- [ ] `REPLIT_IP_ALLOWLIST` configured in Render (if using IP allowlist)
- [ ] Replit configured to call this endpoint after checkout

---

## 🚀 Next Steps

1. **Configure security** in Render:
   - Add `REPLIT_SYNC_SECRET` OR `REPLIT_IP_ALLOWLIST`
   
2. **Configure Replit** to:
   - Call `/v1/sync/tenant` after checkout
   - Send `X-Sync-Secret` header (if using shared secret)
   - Include all required fields in payload

3. **Test the endpoint**:
   - Use curl or Postman
   - Verify tenant is created in database
   - Check logs for success/errors

---

**The endpoint is ready! Just needs security configuration in Render and Replit integration.**

