# Uptime Monitoring Setup Guide

This guide helps you set up uptime monitoring to ensure ≥ 99% API availability.

## 📊 Monitoring Services

### Option 1: UptimeRobot (Recommended - Free)

**Setup Steps:**

1. **Create Account**
   - Go to https://uptimerobot.com
   - Sign up for free account (50 monitors free)

2. **Add Monitor**
   - Click "Add New Monitor"
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `Sinna API`
   - URL: `https://sinna.site/health`
   - Monitoring Interval: **1 minute**
   - Alert Contacts: Add your email

3. **Configure Alert Settings**
   - Alert when: Down for 1 minute
   - Alert contacts: Email, SMS, or webhook
   - Set up multiple alert contacts for redundancy

4. **Verify Setup**
   - Wait for first check (within 1 minute)
   - Verify status shows "UP"
   - Test by temporarily blocking the endpoint

**Advantages:**
- ✅ Free tier (50 monitors)
- ✅ 1-minute check interval
- ✅ Email/SMS alerts
- ✅ Public status page option
- ✅ Historical uptime data

### Option 2: Pingdom

**Setup Steps:**

1. **Create Account**
   - Go to https://www.pingdom.com
   - Sign up (paid service, ~$10/month)

2. **Add Check**
   - Check Type: **HTTP**
   - URL: `https://sinna.site/health`
   - Check Interval: **1 minute**
   - Alert Threshold: 1 consecutive failure

3. **Configure Alerts**
   - Email alerts
   - SMS alerts (optional)
   - Webhook integration

**Advantages:**
- ✅ Very reliable
- ✅ Detailed analytics
- ✅ Transaction monitoring
- ✅ Global check locations

### Option 3: StatusCake

**Setup Steps:**

1. **Create Account**
   - Go to https://www.statuscake.com
   - Sign up for free account

2. **Add Uptime Test**
   - Website URL: `https://sinna.site/health`
   - Test Type: **HTTP**
   - Check Rate: **1 minute**
   - Alert Contacts: Add email

**Advantages:**
- ✅ Free tier available
- ✅ 1-minute intervals
- ✅ Public status pages
- ✅ SSL monitoring

### Option 4: Custom Monitoring (Prometheus + Grafana)

**Setup Steps:**

1. **Deploy Prometheus**
   - Use existing `/metrics` endpoint
   - Configure Prometheus to scrape `https://sinna.site/metrics`

2. **Configure Alerts**
   - Set up alert rules for uptime
   - Configure Alertmanager for notifications

3. **Visualize in Grafana**
   - Create dashboard
   - Set up uptime panel

**Advantages:**
- ✅ Full control
- ✅ Custom metrics
- ✅ Integration with existing monitoring

---

## 🔧 Health Check Endpoint

### Endpoint Details

**URL:** `https://sinna.site/health`

**Method:** `GET`

**Authentication:** Optional (no API key required for health checks)

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "r2": "configured"
  }
}
```

**Status Codes:**
- `200 OK`: Service is healthy
- `503 Service Unavailable`: Service is unhealthy

### Monitoring Configuration

**Recommended Settings:**
- **Check Interval**: 1 minute
- **Timeout**: 5 seconds
- **Alert Threshold**: 1 consecutive failure
- **Alert Contacts**: Email + SMS (optional)

---

## 📈 Uptime Targets

### Standard Plan SLA
- **Target**: ≥ 99% uptime
- **Monthly Downtime**: ≤ 7.2 hours/month
- **Annual Downtime**: ≤ 87.6 hours/year

### Monitoring Metrics
- **Uptime Percentage**: Tracked monthly
- **Response Time**: Tracked at `/metrics`
- **Error Rate**: Tracked via Sentry

---

## 🚨 Alert Configuration

### Critical Alerts

**Immediate Alerts (1 minute):**
- API is down
- Health check fails
- SSL certificate expired

**Warning Alerts (5 minutes):**
- High error rate (>1%)
- Slow response times (>2 seconds)
- High queue depth (>1000 jobs)

### Alert Channels

**Email:**
- Primary contact for downtime alerts
- Include timestamp and error details

**SMS (Optional):**
- Critical alerts only
- Business hours preferred

**Webhook (Optional):**
- Integrate with Slack, PagerDuty, etc.
- Custom alert handling

---

## 📊 Status Page

### Public Status Page

**Recommended:** Use UptimeRobot Public Status Page

**Setup:**
1. Enable "Public Status Page" in UptimeRobot
2. Customize with your branding
3. Share URL: `https://status.sinna.site` (or your custom domain)

**Alternative:** Use Status.io or similar service

---

## ✅ Verification Checklist

- [ ] Monitor configured with 1-minute check interval
- [ ] Alert contacts configured (email + optional SMS)
- [ ] Health check endpoint verified (`/health`)
- [ ] Test alerts by temporarily blocking endpoint
- [ ] Public status page configured (optional)
- [ ] Historical uptime data accessible
- [ ] Alert thresholds configured appropriately

---

## 🔍 Troubleshooting

### Monitor Shows Down But API Is Up

1. **Check Health Endpoint**
   ```bash
   curl https://sinna.site/health
   ```

2. **Verify SSL Certificate**
   ```bash
   openssl s_client -connect sinna.site:443
   ```

3. **Check Firewall Rules**
   - Ensure monitoring service IPs are allowed
   - Check Render firewall settings

### False Positives

1. **Increase Timeout**: Some services have default 30s timeout
2. **Check Interval**: Increase to 2-5 minutes if needed
3. **Alert Threshold**: Require 2-3 consecutive failures

---

## 📝 Monitoring Best Practices

1. **Multiple Monitoring Services**: Use 2+ services for redundancy
2. **Multiple Check Locations**: Monitor from different geographic regions
3. **Alert Redundancy**: Configure multiple alert channels
4. **Regular Testing**: Test alerts monthly
5. **Documentation**: Keep monitoring setup documented

---

## 🎯 Recommended Setup

**For Production:**

1. **Primary**: UptimeRobot (free tier)
   - 1-minute checks
   - Email alerts
   - Public status page

2. **Secondary**: StatusCake or Pingdom
   - Backup monitoring
   - Different geographic locations

3. **Internal**: Prometheus + Grafana
   - Detailed metrics
   - Custom dashboards
   - Historical data

---

**Setup Time:** ~15 minutes  
**Ongoing Maintenance:** Minimal (review alerts monthly)

