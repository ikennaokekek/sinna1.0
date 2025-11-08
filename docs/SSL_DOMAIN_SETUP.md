# SSL Certificate & Domain Setup Guide

This guide helps you set up `sinna.site` domain with SSL certificate for production.

## 🌐 Domain Setup

### Step 1: Configure Custom Domain in Render

1. **Go to Render Dashboard**
   - Navigate to your `sinna-api` service
   - Click on "Settings" tab
   - Scroll to "Custom Domains" section

2. **Add Custom Domain**
   - Click "Add Custom Domain"
   - Enter: `sinna.site`
   - Click "Add"

3. **Get DNS Records**
   - Render will provide DNS records to add
   - Typically: CNAME record pointing to Render service

### Step 2: Configure DNS Records

**In Your Domain Registrar (e.g., Namecheap, GoDaddy):**

1. **Add CNAME Record**
   ```
   Type: CNAME
   Name: @ (or root domain)
   Value: [Render-provided hostname]
   TTL: 3600
   ```

2. **Add CNAME for www (Optional)**
   ```
   Type: CNAME
   Name: www
   Value: sinna.site
   TTL: 3600
   ```

3. **Wait for Propagation**
   - DNS changes take 1-24 hours to propagate
   - Check with: `dig sinna.site` or `nslookup sinna.site`

### Step 3: SSL Certificate

**Render automatically provisions SSL certificates:**

1. **Automatic SSL**
   - Render uses Let's Encrypt for free SSL certificates
   - SSL is automatically provisioned once DNS is configured
   - Certificate auto-renews every 90 days

2. **Verify SSL**
   - Wait for DNS propagation
   - SSL certificate will be provisioned automatically
   - Check status in Render dashboard

---

## ✅ SSL Verification

### Verify SSL Certificate

**Method 1: Command Line**
```bash
# Check SSL certificate
openssl s_client -connect sinna.site:443 -servername sinna.site

# Check certificate expiration
echo | openssl s_client -connect sinna.site:443 -servername sinna.site 2>/dev/null | openssl x509 -noout -dates
```

**Method 2: Online Tools**
- **SSL Labs**: https://www.ssllabs.com/ssltest/analyze.html?d=sinna.site
- **SSL Checker**: https://www.sslshopper.com/ssl-checker.html#hostname=sinna.site

**Method 3: Browser**
- Visit: `https://sinna.site/health`
- Click padlock icon in address bar
- Verify certificate details

### Expected SSL Details

**Certificate Authority:** Let's Encrypt  
**Certificate Type:** DV (Domain Validated)  
**Key Algorithm:** RSA 2048-bit or ECDSA  
**Validity:** 90 days (auto-renewed)  
**TLS Version:** TLS 1.2 or higher

---

## 🔧 Environment Variables Update

### Update BASE_URL

**In Render Dashboard:**

1. **Go to Environment Variables**
   - Navigate to Environment Group
   - Find `BASE_URL` variable

2. **Update Value**
   ```
   BASE_URL=https://sinna.site
   ```

3. **Apply Changes**
   - Save changes
   - Service will restart automatically

### Update Other Domain References

**Update these environment variables:**

```bash
BASE_URL=https://sinna.site
STATUS_PAGE_URL=https://status.sinna.site
CORS_ORIGINS=https://app.sinna.site,https://studio.sinna.site
```

---

## 📋 Verification Checklist

### Domain Setup
- [ ] Custom domain added in Render dashboard
- [ ] DNS CNAME record configured
- [ ] DNS propagation complete (verified with `dig` or `nslookup`)
- [ ] Domain resolves to Render service

### SSL Certificate
- [ ] SSL certificate automatically provisioned by Render
- [ ] Certificate valid (check with SSL Labs)
- [ ] HTTPS accessible (`https://sinna.site/health`)
- [ ] Certificate expiration date verified
- [ ] Auto-renewal confirmed

### Environment Variables
- [ ] `BASE_URL` updated to `https://sinna.site`
- [ ] `STATUS_PAGE_URL` updated (if using custom status page)
- [ ] `CORS_ORIGINS` updated with production domains
- [ ] All services restarted with new variables

### Testing
- [ ] Health check works: `curl https://sinna.site/health`
- [ ] API endpoints accessible: `curl https://sinna.site/v1/demo`
- [ ] SSL certificate shows valid in browser
- [ ] No mixed content warnings
- [ ] Redirects work (HTTP → HTTPS)

---

## 🚨 Troubleshooting

### Domain Not Resolving

**Check DNS:**
```bash
dig sinna.site
nslookup sinna.site
```

**Common Issues:**
- DNS propagation not complete (wait 1-24 hours)
- Wrong DNS records configured
- DNS caching (flush DNS cache)

### SSL Certificate Not Provisioning

**Check Render Dashboard:**
- Verify domain is added correctly
- Check SSL certificate status
- Look for error messages

**Common Issues:**
- DNS not fully propagated
- Domain not pointing to Render
- Rate limiting (Let's Encrypt has rate limits)

### SSL Certificate Expired

**Render Auto-Renewal:**
- Render automatically renews Let's Encrypt certificates
- Check renewal status in dashboard
- If expired, remove and re-add domain

---

## 🔒 Security Best Practices

### SSL/TLS Configuration

**Recommended Settings:**
- **Minimum TLS Version**: TLS 1.2
- **Preferred TLS Version**: TLS 1.3
- **Cipher Suites**: Modern, secure ciphers only
- **HSTS**: Enable HTTP Strict Transport Security

### Render SSL Features

- ✅ Automatic SSL provisioning
- ✅ Automatic certificate renewal
- ✅ TLS 1.2+ support
- ✅ Modern cipher suites
- ✅ HSTS headers (configured automatically)

---

## 📊 Monitoring SSL Certificate

### Certificate Expiration Monitoring

**Option 1: UptimeRobot**
- Add SSL certificate monitoring
- Alerts when certificate expires in <30 days

**Option 2: Custom Script**
```bash
#!/bin/bash
# Check SSL expiration
expiry=$(echo | openssl s_client -connect sinna.site:443 -servername sinna.site 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
expiry_epoch=$(date -d "$expiry" +%s)
current_epoch=$(date +%s)
days_until_expiry=$(( ($expiry_epoch - $current_epoch) / 86400 ))

if [ $days_until_expiry -lt 30 ]; then
  echo "WARNING: SSL certificate expires in $days_until_expiry days"
fi
```

---

## ✅ Final Verification

**Run these commands to verify everything:**

```bash
# 1. Verify DNS resolution
dig sinna.site +short

# 2. Verify SSL certificate
openssl s_client -connect sinna.site:443 -servername sinna.site < /dev/null

# 3. Verify HTTPS access
curl -I https://sinna.site/health

# 4. Verify API endpoints
curl https://sinna.site/v1/demo

# 5. Check SSL rating
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=sinna.site
```

---

**Setup Time:** 1-2 hours (mostly DNS propagation wait)  
**SSL Provisioning:** Automatic (within 1 hour after DNS propagation)  
**Maintenance:** Minimal (auto-renewal handled by Render)

