# ✅ Replit Email Configuration Checklist

Since you're using **Replit Developer Portal** for checkout, Replit should handle email delivery.

---

## 🔍 Check Replit Email Configuration

### 1. Verify Replit Has Email Service Configured

**In Replit Developer Portal:**
- ✅ Is `RESEND_API_KEY` configured?
- ✅ Is email sending enabled after checkout?
- ✅ Check Replit environment variables for email service

---

### 2. Check Replit Logs for Email Errors

**In Replit Dashboard/Logs:**
- Search for: `"email"` or `"sendEmail"` or `"Resend"`
- Look for errors like:
  - `"Failed to send email"`
  - `"Email service not configured"`
  - `"Resend API error"`

---

### 3. Verify Replit Sync to Render

**Check Render Logs for:**
- `"Received tenant sync request from Replit"`
- `"Tenant sync completed successfully"`

**If you see these:**
- ✅ Replit processed checkout
- ✅ Replit synced tenant to Render
- ❌ But Replit didn't send email (check Replit email config)

---

### 4. Check Replit Code

**In Replit checkout handler:**
- Does it call email service after checkout?
- Is email service properly configured?
- Are there any try/catch blocks swallowing email errors?

---

## 🚨 Common Issues

### Issue 1: Replit Email Service Not Configured

**Symptoms:**
- Checkout completes
- Tenant synced to Render
- No email sent

**Fix:**
- Add `RESEND_API_KEY` to Replit environment variables
- Verify email service is called after checkout

---

### Issue 2: Replit Email Service Error

**Symptoms:**
- Email service called but fails
- Error in Replit logs

**Fix:**
- Check Resend API key is valid
- Verify domain is verified in Resend
- Check Replit logs for specific error

---

### Issue 3: Replit Not Calling Email Service

**Symptoms:**
- Checkout completes
- No email service call in logs

**Fix:**
- Update Replit code to send email after checkout
- Ensure email service is properly integrated

---

## 📋 Architecture Reminder

**Replit Flow:**
1. Customer completes Stripe checkout
2. Replit receives webhook
3. Replit generates API key
4. **Replit sends email** ← This is the issue!
5. Replit syncs tenant to Render via `/v1/sync/tenant`

**Render Flow:**
1. Receives sync request from Replit
2. Stores tenant and API key
3. Ready for API authentication

---

## ✅ Next Steps

1. **Check onboarding email configuration**
2. **Check onboarding logs** for email errors
3. **Verify onboarding sends email** after checkout
4. **Verify the authenticated tenant sync completes**
5. **Test checkout and sync flow** end-to-end

---

**The issue is in Replit's email configuration, not Render!**

