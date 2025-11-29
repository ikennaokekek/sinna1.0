# ✅ Replit Sync Configuration Complete

## 🔐 Security Secret Generated

I've added `REPLIT_SYNC_SECRET` to your Render environment variables.

---

## 📋 Configuration Details

### Render Environment Variable

**Key:** `REPLIT_SYNC_SECRET`  
**Value:** `a7f3c9e2b8d4f1a6c5e9b2d7f4a8c1e6b9d3f7a2c5e8b1d4f9a6c3e7b2d5f8a1`

**Status:** ✅ Added to Render  
**Deployment:** Auto-deploy triggered

---

## 🔧 Replit Configuration Required

### Step 1: Add Secret to Replit

**In Replit Developer Portal:**

1. Go to your Replit project settings
2. Add environment variable:
   - **Key:** `REPLIT_SYNC_SECRET`
   - **Value:** `a7f3c9e2b8d4f1a6c5e9b2d7f4a8c1e6b9d3f7a2c5e8b1d4f9a6c3e7b2d5f8a1`

---

### Step 2: Update Replit Code

**In your Replit checkout handler, after processing payment:**

```javascript
// After checkout completes and API key is generated
const syncResponse = await fetch('https://sinna1-0.onrender.com/v1/sync/tenant', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Sync-Secret': process.env.REPLIT_SYNC_SECRET, // Use the secret from env
  },
  body: JSON.stringify({
    tenantId: tenantId, // UUID from Replit
    email: customerEmail,
    hashed_api_key: hashedApiKey, // SHA-256 hash of API key
    plan: 'standard',
    subscription_status: 'active',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    stripe_customer_id: stripeCustomerId, // optional
    stripe_subscription_id: stripeSubscriptionId, // optional
  }),
});

if (!syncResponse.ok) {
  console.error('Failed to sync tenant to Render:', await syncResponse.text());
} else {
  console.log('Tenant synced to Render successfully');
}
```

---

## 📋 Required Fields

### Request Body

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000", // UUID
  "email": "client@example.com", // Customer email
  "hashed_api_key": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3", // SHA-256 hash (64 hex chars)
  "plan": "standard", // "standard" or "pro"
  "subscription_status": "active", // "active", "inactive", "expired", "trialing", "past_due", "canceled"
  "expires_at": "2025-12-31T23:59:59.000Z", // ISO 8601 datetime
  "stripe_customer_id": "cus_xxx", // optional
  "stripe_subscription_id": "sub_xxx" // optional
}
```

---

## 🔍 Verification

### Test the Endpoint

```bash
curl -X POST https://sinna1-0.onrender.com/v1/sync/tenant \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: a7f3c9e2b8d4f1a6c5e9b2d7f4a8c1e6b9d3f7a2c5e8b1d4f9a6c3e7b2d5f8a1" \
  -d '{
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test@example.com",
    "hashed_api_key": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    "plan": "standard",
    "subscription_status": "active",
    "expires_at": "2025-12-31T23:59:59.000Z"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Tenant created successfully",
  "data": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "synced": true,
    "action": "created"
  }
}
```

---

### Check Render Logs

After Replit calls the endpoint, check Render logs for:
- ✅ `"Received tenant sync request from Replit"`
- ✅ `"Tenant sync completed successfully"`

If you see errors:
- ❌ `"Sync request rejected: invalid origin"` → Secret mismatch
- ❌ `"validation_error"` → Invalid payload format

---

## 🔐 Security Notes

1. **Keep secret secure:** Don't commit to git or expose publicly
2. **Use environment variables:** Store in Replit env vars, not hardcoded
3. **Rotate if compromised:** Generate new secret if exposed
4. **Monitor logs:** Watch for unauthorized access attempts

---

## ✅ Checklist

- [x] `REPLIT_SYNC_SECRET` added to Render
- [ ] `REPLIT_SYNC_SECRET` added to Replit environment
- [ ] Replit code updated to call `/v1/sync/tenant`
- [ ] Replit sends `X-Sync-Secret` header
- [ ] Test endpoint with curl
- [ ] Verify tenant sync in Render logs

---

## 🚀 Next Steps

1. **Add secret to Replit** (see Step 1 above)
2. **Update Replit code** to call sync endpoint (see Step 2 above)
3. **Test the flow:**
   - Complete test checkout in Replit
   - Verify sync request is sent
   - Check Render logs for success
   - Verify tenant exists in database

---

**Configuration complete! Now configure Replit to use this secret.**

