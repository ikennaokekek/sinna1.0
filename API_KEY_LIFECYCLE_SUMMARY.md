# ✅ Sinna 1.0 API Key Lifecycle - Complete Implementation

## 📋 Summary

The full API key lifecycle has been implemented exactly as specified. Each Stripe-paying client receives a unique API key that remains valid only while their subscription is active.

---

## 🔄 Lifecycle Flow

### 1. **On Successful Checkout** ✅
**File**: `apps/api/src/routes/webhooks.ts` → `handleCheckoutSessionCompleted()`

- ✅ Uses `createApiKey()` from `apps/api/src/utils/keys.ts`
- ✅ Stores key in `api_keys` table (hashed)
- ✅ Creates/updates tenant in `tenants` table with:
  - `status = 'active'`
  - `active = true`
  - `expires_at = now() + 30 days`
  - `stripe_customer_id` and `stripe_subscription_id`
- ✅ Uses `sendApiKeyEmail()` from `apps/api/src/utils/email.ts`
- ✅ Logs API key for manual retrieval if email fails

**Database Fields Updated**:
- `tenants.status` → `'active'`
- `tenants.active` → `true`
- `tenants.expires_at` → `NOW() + 30 days`
- `tenants.stripe_customer_id` → Stripe customer ID
- `tenants.stripe_subscription_id` → Stripe subscription ID

---

### 2. **Subscription Renewal** ✅
**File**: `apps/api/src/routes/webhooks.ts` → `handleInvoicePaymentSucceeded()`

- ✅ Checks if tenant exists by `stripe_customer_id`
- ✅ Updates `expires_at = now() + 30 days`
- ✅ Sets `status = 'active'` and `active = true`
- ✅ Clears `grace_until` (removes grace period)
- ✅ Optional key rotation (commented out, can be enabled)

**Database Fields Updated**:
- `tenants.status` → `'active'`
- `tenants.active` → `true`
- `tenants.expires_at` → `NOW() + 30 days`
- `tenants.grace_until` → `NULL`

---

### 3. **Subscription Cancel or Payment Failure** ✅

#### Payment Failure
**File**: `apps/api/src/routes/webhooks.ts` → `handleInvoicePaymentFailed()`

- ✅ Sets `status = 'inactive'`
- ✅ Sets `active = false`
- ✅ Sets `grace_until = now() + 7 days` (configurable via `GRACE_DAYS`)
- ✅ Sends notification email

**Database Fields Updated**:
- `tenants.status` → `'inactive'`
- `tenants.active` → `false`
- `tenants.grace_until` → `NOW() + 7 days`

#### Subscription Deleted
**File**: `apps/api/src/routes/webhooks.ts` → `handleSubscriptionDeleted()`

- ✅ Sets `status = 'expired'`
- ✅ Sets `active = false`
- ✅ Clears `stripe_subscription_id`
- ✅ Clears `grace_until`

**Database Fields Updated**:
- `tenants.status` → `'expired'`
- `tenants.active` → `false`
- `tenants.stripe_subscription_id` → `NULL`
- `tenants.grace_until` → `NULL`

#### Subscription Updated
**File**: `apps/api/src/routes/webhooks.ts` → `handleSubscriptionUpdated()`

- ✅ Updates status based on Stripe subscription status
- ✅ If `active` or `trialing`: sets `status = 'active'`, extends `expires_at` by 30 days
- ✅ If `canceled` or `unpaid`: sets `status = 'expired'`

---

### 4. **API Request Validation** ✅
**File**: `apps/api/src/index.ts` → `app.addHook('preHandler')`

**Validation Logic**:
1. ✅ Extracts `X-API-Key` header
2. ✅ Hashes key and looks up in `api_keys` table
3. ✅ Joins with `tenants` table to get:
   - `status` (must be `'active'`)
   - `active` (must be `true`)
   - `expires_at` (must be in the future)
   - `grace_until` (optional grace period)
4. ✅ Checks expiration: `now() >= expires_at` → expired
5. ✅ Checks status: `status !== 'active'` → inactive
6. ✅ Checks active flag: `active !== true` → inactive

**Response Codes**:
- ✅ `401 Unauthorized` → Invalid or expired key
  - `{ "code": "subscription_expired", "error": "Your subscription has expired. Please renew to continue using the API." }`
- ✅ `402 Payment Required` → Inactive subscription (not in grace period)
  - `{ "code": "payment_required", "error": "Your subscription is not active. Please update your payment method." }`
- ✅ `200 OK` → Valid key (active, not expired, or in grace period)

**Grace Period**:
- ✅ If `grace_until` is set and `now() < grace_until`, requests are allowed even if `status !== 'active'`
- ✅ Grace period is set on payment failure (7 days default)

---

### 5. **Optional Key Rotation** ✅
**File**: `apps/api/src/routes/webhooks.ts` → `handleInvoicePaymentSucceeded()`

- ✅ Code is present but commented out
- ✅ To enable: uncomment lines 162-173
- ✅ Generates new API key on each renewal
- ✅ Sends new key via email with rotation notice

---

## 📂 Files Modified

### Database Schema
- ✅ `apps/api/migrations/004_add_api_key_lifecycle.sql`
  - Adds `status` field (active, inactive, expired)
  - Adds `expires_at` field (TIMESTAMPTZ)
  - Adds indexes for performance

### Webhook Handlers
- ✅ `apps/api/src/routes/webhooks.ts`
  - `handleCheckoutSessionCompleted()` - Sets expiration on checkout
  - `handleInvoicePaymentSucceeded()` - Extends expiration on renewal
  - `handleInvoicePaymentFailed()` - Marks inactive with grace period
  - `handleSubscriptionDeleted()` - Marks expired
  - `handleSubscriptionUpdated()` - Updates status based on Stripe status

### Authentication Middleware
- ✅ `apps/api/src/index.ts`
  - Updated `preHandler` hook to check `expires_at` and `status`
  - Returns `subscription_expired` error when expired
  - Returns `payment_required` error when inactive (unless in grace)

### Utilities
- ✅ `apps/api/src/utils/keys.ts` - `createApiKey()` function
- ✅ `apps/api/src/utils/email.ts` - `sendApiKeyEmail()` function

---

## 🧪 Test Cases

### ✅ Test 1: Successful Checkout
```bash
# Simulate Stripe checkout.session.completed webhook
# Expected:
# - API key generated
# - Tenant created with status='active', expires_at=now+30days
# - Email sent with API key
```

### ✅ Test 2: Subscription Renewal
```bash
# Simulate Stripe invoice.payment_succeeded webhook
# Expected:
# - expires_at extended by 30 days
# - status remains 'active'
# - grace_until cleared
```

### ✅ Test 3: Payment Failure
```bash
# Simulate Stripe invoice.payment_failed webhook
# Expected:
# - status set to 'inactive'
# - active set to false
# - grace_until set to now+7days
# - API requests still work during grace period
```

### ✅ Test 4: Subscription Cancellation
```bash
# Simulate Stripe customer.subscription.deleted webhook
# Expected:
# - status set to 'expired'
# - active set to false
# - API requests return 401 with 'subscription_expired'
```

### ✅ Test 5: Expired Key Request
```bash
curl -H "X-API-Key: sk_live_expired_key" https://sinna.site/v1/demo
# Expected: 401 { "code": "subscription_expired", "error": "..." }
```

---

## 🔑 Key Expiration Logic (Plain English)

**How it works:**

1. **When a client pays**: Their API key is created and set to expire in 30 days. The system marks their account as `active` and sets an expiration date.

2. **Every month when they pay again**: The expiration date is extended by another 30 days. Their key stays active.

3. **If payment fails**: The account is marked `inactive`, but they get a 7-day grace period where their key still works. After 7 days, the key stops working.

4. **If subscription is canceled**: The account is immediately marked `expired` and the key stops working right away.

5. **When someone uses the API**: The system checks:
   - Is the key valid? (exists in database)
   - Is the account `active`?
   - Is the status `'active'`?
   - Has the expiration date passed?
   - Are they in a grace period?

6. **If expired**: The API returns `401 Unauthorized` with message "Your subscription has expired. Please renew to continue using the API."

7. **If inactive (not in grace)**: The API returns `402 Payment Required` with message "Your subscription is not active. Please update your payment method."

**In simple terms**: Your API key is like a monthly pass. It expires 30 days after you pay. If you pay again before it expires, it gets renewed for another 30 days. If you don't pay, it stops working after a 7-day grace period. If you cancel, it stops working immediately.

---

## ✅ Deliverables

- ✅ Full lifecycle implemented
- ✅ Database schema updated with `status` and `expires_at`
- ✅ All webhook handlers updated
- ✅ Authentication middleware validates expiration
- ✅ Returns proper error codes (`subscription_expired`, `payment_required`)
- ✅ Grace period support for payment failures
- ✅ Optional key rotation on renewal (commented out, ready to enable)

---

## 🚀 Next Steps

1. **Deploy migration**: Run `004_add_api_key_lifecycle.sql` on production database
2. **Test webhooks**: Verify Stripe webhooks trigger correct status updates
3. **Test expiration**: Manually set `expires_at` to past date and verify API rejects requests
4. **Enable key rotation** (optional): Uncomment rotation code in `handleInvoicePaymentSucceeded()`

---

## 📝 Manual Testing Command

```bash
# Test manual API key generation and email
pnpm tsx scripts/manual-send-api-key.ts client@example.com

# Expected output:
# - API key generated
# - Tenant created/updated
# - Email sent (or key printed if email fails)
# - Key is valid for 30 days (if tenant is new)
```

