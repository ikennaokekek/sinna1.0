# 🔒 Security Fix: Hardcoded Stripe API Keys Removed

**Date:** 2025-12-23  
**Severity:** 🔴 **CRITICAL**  
**Status:** ✅ **FIXED**

---

## 🚨 Security Issue

**Problem:** Live Stripe API keys were hardcoded as string literals in script files, exposing them in git history and repository.

**Affected Files:**
1. `scripts/quick-create-checkout.ts` - Live key hardcoded
2. `scripts/create_checkout.py` - Live key hardcoded
3. `scripts/create-test-checkout-now.ts` - Test key hardcoded

**Risk:**
- 🔴 **CRITICAL:** Live Stripe keys exposed in git history
- Anyone with repository access can see the keys
- Keys can be used to create charges, access customer data, modify subscriptions
- Keys are now permanently in git history (even if removed)

---

## ✅ Fix Applied

### Changes Made

1. **Removed hardcoded keys** from all three files
2. **Replaced with environment variables:**
   - `STRIPE_SECRET_KEY` - Required (from environment)
   - `STRIPE_STANDARD_PRICE_ID` - Optional (defaults to production price ID)
   - `BASE_URL_PUBLIC` - Optional (defaults to https://sinna.site)

3. **Added validation:**
   - Scripts now check for required environment variables
   - Clear error messages if variables are missing
   - Instructions on how to set them

### Updated Files

- ✅ `scripts/quick-create-checkout.ts` - Now uses `process.env.STRIPE_SECRET_KEY`
- ✅ `scripts/create_checkout.py` - Now uses `os.environ.get('STRIPE_SECRET_KEY')`
- ✅ `scripts/create-test-checkout-now.ts` - Now uses `process.env.STRIPE_SECRET_KEY`

---

## 🔄 Required Actions

### 1. **IMMEDIATE: Rotate Exposed Keys**

**The exposed keys MUST be rotated immediately:**

1. **Go to Stripe Dashboard:**
   - https://dashboard.stripe.com/apikeys
   - Find the exposed live key: `sk_live_51S6bd4FOUj5aKuFK...`
   - Find the exposed test key: `sk_test_51S6bd4FOUj5aKuFK...`

2. **Revoke the exposed keys:**
   - Click "Reveal test key" or "Reveal live key"
   - Click "Revoke" button
   - Confirm revocation

3. **Create new keys:**
   - Click "Create new key"
   - Copy the new key
   - Update in Render environment variables

4. **Update Render Environment:**
   - Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
   - Click "Environment" tab
   - Update `STRIPE_SECRET_KEY` with new key
   - Save changes (will trigger redeploy)

### 2. **Update Script Usage**

**Before (INSECURE):**
```bash
pnpm tsx scripts/quick-create-checkout.ts
```

**After (SECURE):**
```bash
export STRIPE_SECRET_KEY="sk_live_..."
export STRIPE_STANDARD_PRICE_ID="price_..."
pnpm tsx scripts/quick-create-checkout.ts
```

**Or use helper script:**
```bash
./scripts/create-checkout-with-env.sh
```

### 3. **Verify Git History**

**Check if keys are in git history:**
```bash
git log --all --full-history -p | grep -i "sk_live_51S6bd4FOUj5aKuFK"
```

**If found in history:**
- Keys are permanently exposed in git history
- Consider using `git-filter-repo` to remove from history (advanced)
- Or accept that keys are exposed and ensure they're rotated

---

## 📋 Verification Checklist

- [x] Hardcoded keys removed from code
- [x] Environment variable validation added
- [x] Error messages added for missing variables
- [ ] **Exposed keys rotated in Stripe** (CRITICAL - DO THIS NOW)
- [ ] **Render environment updated with new keys**
- [ ] Git history checked for exposed keys
- [ ] Team notified of key rotation

---

## 🔐 Security Best Practices Going Forward

1. **Never commit secrets:**
   - Use environment variables
   - Use `.env` files (add to `.gitignore`)
   - Use secret management services (Render Secrets, AWS Secrets Manager, etc.)

2. **Use different keys per environment:**
   - Test keys for development/testing
   - Live keys only in production
   - Never mix test/live keys

3. **Rotate keys regularly:**
   - Quarterly rotation recommended
   - Immediately if exposed

4. **Monitor key usage:**
   - Check Stripe Dashboard → API Logs
   - Set up alerts for unusual activity
   - Review access logs regularly

---

## 📊 Impact Assessment

**Before Fix:**
- 🔴 Live Stripe keys exposed in code
- 🔴 Keys visible to anyone with repo access
- 🔴 Keys in git history permanently
- 🔴 Risk of unauthorized charges

**After Fix:**
- ✅ Keys removed from code
- ✅ Environment variables required
- ✅ Clear error messages if missing
- ⚠️ Keys still in git history (must rotate)

---

## 🚨 URGENT: Next Steps

1. **Rotate exposed keys NOW** (see section above)
2. **Update Render environment** with new keys
3. **Test scripts** with new environment variables
4. **Monitor Stripe logs** for unauthorized access
5. **Review git history** and consider cleanup

---

**Status:** ✅ **Code Fixed** | ⚠️ **Keys Must Be Rotated**  
**Priority:** 🔴 **CRITICAL - Rotate Keys Immediately**

