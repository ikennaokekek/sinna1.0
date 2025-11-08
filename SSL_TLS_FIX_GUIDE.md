# SSL/TLS Fix Guide for sinna.site

## ✅ Good News: Service IS Running!

**Test Results:**
- ✅ Service responds: `sinna1-0.onrender.com` returns `401 unauthorized` (service is up!)
- ❌ Browser SSL error: `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`
- ❌ Cloudflare 522: Origin timeout (likely SSL handshake issue)

---

## Root Cause

The service is running, but there's an **SSL/TLS handshake failure** between:
1. **Browser** ↔ **Cloudflare** (SSL error)
2. **Cloudflare** ↔ **Render** (522 timeout)

This happens when Cloudflare can't establish a secure connection to Render's origin.

---

## Fix Steps

### Step 1: Fix Cloudflare SSL/TLS Mode (CRITICAL)

1. **Go to Cloudflare Dashboard:**
   - Navigate to: https://dash.cloudflare.com
   - Select your domain: `sinna.site`
   - Go to **SSL/TLS** → **Overview**

2. **Check Current Mode:**
   - ❌ **"Flexible"** = Cloudflare → Render uses HTTP (causes 522)
   - ✅ **"Full"** = Cloudflare → Render uses HTTPS (recommended)
   - ✅ **"Full (strict)"** = Cloudflare → Render uses HTTPS + validates cert (best)

3. **Set to "Full" or "Full (strict)":**
   - Click the dropdown
   - Select **"Full"** (or "Full (strict)" if Render has valid SSL)
   - Save changes

**Why this fixes it:**
- "Flexible" mode tries to connect to Render over HTTP, but Render requires HTTPS
- "Full" mode connects over HTTPS, matching Render's SSL certificate

---

### Step 2: Verify Render SSL Certificate

1. **Test Render SSL directly:**
   ```bash
   # Test SSL certificate validity
   openssl s_client -connect sinna1-0.onrender.com:443 -servername sinna1-0.onrender.com < /dev/null 2>&1 | grep -A 5 "Certificate chain"
   ```

2. **Expected Output:**
   - Should show valid certificate chain
   - Certificate should be issued by Let's Encrypt or similar

3. **If Certificate is Invalid:**
   - Render should auto-generate SSL certificates
   - Check Render dashboard → Settings → Custom Domains
   - Ensure `sinna.site` is listed and shows "Active"
   - If it shows "Error", click "Retry" or "Verify"

---

### Step 3: Update Cloudflare DNS (Verify)

1. **Go to Cloudflare Dashboard:**
   - Navigate to **DNS** → **Records**

2. **Verify DNS Record:**
   ```
   Type: CNAME
   Name: @ (or sinna.site)
   Target: sinna1-0.onrender.com
   Proxy status: Proxied (orange cloud) ✅
   TTL: Auto
   ```

3. **Remove Duplicate Records:**
   - If there are multiple A or CNAME records, remove them
   - Only ONE CNAME record should exist

---

### Step 4: Clear Cloudflare Cache

1. **Go to Cloudflare Dashboard:**
   - Navigate to **Caching** → **Configuration**
   - Click **"Purge Everything"**
   - Wait 30 seconds

**Why:** Cloudflare may have cached the old SSL error response.

---

### Step 5: Verify Render Custom Domain

1. **Go to Render Dashboard:**
   - Navigate to: https://dashboard.render.com
   - Open your `sinna-api` service
   - Go to **Settings** → **Custom Domains**

2. **Check Domain Status:**
   - `sinna.site` should be listed
   - Status should show: **"Active"** or **"Verifying"**
   - If it shows **"Error"**:
     - Click **"Retry"** or **"Verify"**
     - Wait 2-3 minutes for DNS propagation

---

### Step 6: Test After Fixes

**Wait 2-3 minutes** for changes to propagate, then test:

```bash
# 1. Test Swagger UI (should load HTML)
curl -I https://sinna.site/api-docs
# Expected: HTTP/2 200

# 2. Test Swagger JSON (should list endpoints)
curl -s https://sinna.site/api-docs/json | jq '.paths | keys'
# Expected: ["/health", "/v1/jobs", "/v1/demo", ...]

# 3. Test health endpoint (with API key)
curl -H "x-api-key: YOUR_ACTUAL_API_KEY" https://sinna.site/health
# Expected: {"ok":true,"uptime":...}

# 4. Test demo endpoint (no auth)
curl https://sinna.site/v1/demo
# Expected: {"ok":true,"now":"2024-..."}

# 5. Test in browser
# Open: https://sinna.site/api-docs
# Should show Swagger UI (not SSL error)
```

---

## Troubleshooting

### Issue: Still getting 522 after setting SSL to "Full"

**Solution:**
1. Check Render service logs for SSL errors
2. Verify Render service is actually running (check dashboard)
3. Test direct Render URL: `curl -k https://sinna1-0.onrender.com/v1/demo`
4. If direct URL works but Cloudflare doesn't → SSL mode issue
5. Try "Full (strict)" instead of "Full" (requires valid Render SSL cert)

### Issue: Browser still shows SSL error

**Solution:**
1. Clear browser cache and cookies
2. Try incognito/private mode
3. Check if other browsers show the same error
4. Verify Cloudflare SSL/TLS mode is saved (refresh dashboard)
5. Wait 5-10 minutes for DNS/SSL propagation

### Issue: Render custom domain shows "Error"

**Solution:**
1. Remove the custom domain in Render
2. Wait 1 minute
3. Re-add `sinna.site` as custom domain
4. Render will auto-generate SSL certificate
5. Wait 2-3 minutes for verification

---

## Expected Final State

After fixes:
- ✅ Cloudflare SSL/TLS mode: **"Full"** or **"Full (strict)"**
- ✅ DNS: CNAME record pointing to `sinna1-0.onrender.com` (Proxied)
- ✅ Render custom domain: `sinna.site` shows **"Active"**
- ✅ Browser: `https://sinna.site/api-docs` loads Swagger UI
- ✅ API: All endpoints return 200 or expected status codes

---

## Quick Checklist

- [ ] Cloudflare SSL/TLS mode set to **"Full"** or **"Full (strict)"**
- [ ] DNS CNAME record points to `sinna1-0.onrender.com` (Proxied)
- [ ] Render custom domain `sinna.site` shows **"Active"**
- [ ] Cloudflare cache purged
- [ ] Waited 2-3 minutes for propagation
- [ ] Tested `https://sinna.site/api-docs` in browser
- [ ] Tested `curl https://sinna.site/v1/demo` (returns JSON)

---

**Most Common Fix:** Setting Cloudflare SSL/TLS mode to **"Full"** resolves 90% of these issues.

**Report Generated:** $(date +"%Y-%m-%d %H:%M:%S")

