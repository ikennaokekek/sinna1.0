# Production Verification Instructions

This document provides step-by-step instructions for verifying all systems are production-ready.

## 🎯 Verification Checklist

### 1. Execute Auto-Healing QA Tests

**Option A: Using Script (Recommended)**
```bash
# Make script executable
chmod +x scripts/verify-production.sh

# Run verification
./scripts/verify-production.sh
```

**Option B: Manual Execution**
```bash
# Set environment variables
export E2E_BASE_URL=https://sinna.site
export API_BASE_URL=https://sinna.site
export TEST_API_KEY=sk_live_YOUR_API_KEY
export TEST_VIDEO_URL=https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4

# Run tests
npm run test:heal
```

**Expected Result:**
- All 8 presets tested
- All presets pass (status: "passed")
- Report generated at `tests/reports/autoheal-report.md`

**If Tests Fail:**
- Check error messages in report
- Verify API is accessible
- Check worker is processing jobs
- Review logs for errors

---

### 2. Verify All 8 Presets Pass QA

**Presets to Verify:**
1. `blindness` - Audio descriptions mixed into video
2. `deaf` - Burned captions + volume boost
3. `color_blindness` - Color-safe palette
4. `adhd` - Motion reduction + focus tone
5. `autism` - Lower strobe + muted colors
6. `epilepsy_flash` - Flash/frame reduction
7. `epilepsy_noise` - Low-pass audio filter
8. `cognitive_load` - Simpler contrast + slower cuts

**Verification Steps:**

1. **Check Test Report**
   ```bash
   cat tests/reports/autoheal-report.md
   ```

2. **Verify Each Preset**
   - Status should be "✅ OK" for all presets
   - Job IDs should be present
   - Video transform URLs should be valid
   - Artifact keys should exist

3. **Manual Verification (If Needed)**
   ```bash
   # Test each preset manually
   for preset in blindness deaf color_blindness adhd autism epilepsy_flash epilepsy_noise cognitive_load; do
     echo "Testing preset: $preset"
     curl -X POST https://sinna.site/v1/jobs \
       -H "X-API-Key: sk_live_YOUR_API_KEY" \
       -H "Content-Type: application/json" \
       -d "{\"source_url\": \"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4\", \"preset_id\": \"$preset\"}"
   done
   ```

---

### 3. Set Up API Uptime Monitoring

**See Full Guide:** `docs/UPTIME_MONITORING_SETUP.md`

**Quick Setup (UptimeRobot):**

1. **Create Account**
   - Go to https://uptimerobot.com
   - Sign up for free account

2. **Add Monitor**
   - Monitor Type: HTTP(s)
   - URL: `https://sinna.site/health`
   - Interval: 1 minute
   - Alert Contacts: Add your email

3. **Verify**
   - Wait for first check
   - Status should show "UP"
   - Test alerts by temporarily blocking endpoint

**Expected Result:**
- Monitor shows "UP" status
- Alerts configured and tested
- Uptime tracking active

---

### 4. Verify Domain & SSL (sinna.site)

**See Full Guide:** `docs/SSL_DOMAIN_SETUP.md`

**Quick Verification:**

1. **Check DNS Resolution**
   ```bash
   dig sinna.site +short
   # Should return Render IP address
   ```

2. **Verify HTTPS Access**
   ```bash
   curl -I https://sinna.site/health
   # Should return 200 OK
   ```

3. **Check SSL Certificate**
   ```bash
   openssl s_client -connect sinna.site:443 -servername sinna.site < /dev/null
   # Should show valid certificate
   ```

4. **Verify SSL Rating**
   - Visit: https://www.ssllabs.com/ssltest/analyze.html?d=sinna.site
   - Should show A or A+ rating

**Expected Result:**
- Domain resolves correctly
- HTTPS accessible
- SSL certificate valid
- SSL Labs rating A or A+

---

### 5. Update Environment Variables

**In Render Dashboard:**

1. **Update BASE_URL**
   ```
   BASE_URL=https://sinna.site
   ```

2. **Update STATUS_PAGE_URL** (if using custom status page)
   ```
   STATUS_PAGE_URL=https://status.sinna.site
   ```

3. **Update CORS_ORIGINS** (if needed)
   ```
   CORS_ORIGINS=https://app.sinna.site,https://studio.sinna.site
   ```

4. **Restart Services**
   - Changes take effect automatically
   - Or manually restart in Render dashboard

---

## 📊 Verification Report Template

After completing all verifications, create a report:

```markdown
# Production Verification Report

**Date:** [Date]
**Verified By:** [Your Name]

## ✅ Verification Results

### Auto-Healing QA Tests
- Status: ✅ PASSED / ❌ FAILED
- Presets Tested: 8/8
- Report Location: tests/reports/autoheal-report.md

### Uptime Monitoring
- Service: [UptimeRobot/Pingdom/etc.]
- Status: ✅ CONFIGURED / ❌ NOT CONFIGURED
- Uptime: [Percentage]

### Domain & SSL
- Domain: sinna.site
- DNS Resolution: ✅ WORKING / ❌ NOT WORKING
- SSL Certificate: ✅ VALID / ❌ INVALID
- SSL Rating: [A/A+/B/etc.]

### Environment Variables
- BASE_URL: ✅ SET / ❌ NOT SET
- STATUS_PAGE_URL: ✅ SET / ❌ NOT SET
- CORS_ORIGINS: ✅ SET / ❌ NOT SET

## 📝 Notes

[Any issues found or actions taken]

## ✅ Sign-Off

[Signature/Approval]
```

---

## 🚨 Troubleshooting

### Tests Fail

**Check:**
1. API is accessible: `curl https://sinna.site/health`
2. Worker is running: Check Render dashboard
3. Redis is connected: Check logs
4. R2 credentials are correct: Check environment variables

### Monitoring Not Working

**Check:**
1. Health endpoint is accessible: `curl https://sinna.site/health`
2. Monitor URL is correct
3. Alert contacts are configured
4. Firewall allows monitoring service IPs

### SSL Issues

**Check:**
1. DNS is fully propagated: `dig sinna.site`
2. Domain is added in Render dashboard
3. SSL certificate is provisioned (check dashboard)
4. Certificate is not expired: `openssl s_client ...`

---

## ✅ Final Checklist

Before marking as production-ready:

- [ ] All 8 presets pass auto-healing QA tests
- [ ] Uptime monitoring configured and active
- [ ] Domain `sinna.site` resolves correctly
- [ ] SSL certificate valid and accessible
- [ ] BASE_URL environment variable set to `https://sinna.site`
- [ ] All environment variables updated
- [ ] Health check endpoint accessible
- [ ] Monitoring alerts tested and working
- [ ] Verification report completed

---

**Estimated Time:** 2-4 hours  
**Critical for Production Launch:** ✅ YES

