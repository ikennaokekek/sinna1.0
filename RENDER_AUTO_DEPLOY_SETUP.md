# 🚀 Render Auto-Deploy Setup Guide

**Status:** ⚠️ **ACTION REQUIRED** - Auto-deploy is currently disabled

Your `render.yaml` specifies `autoDeploy: true`, but the actual Render service has auto-deploy disabled. This guide will help you enable it.

---

## 🔍 Current Status

**Service:** `sinna1.0` (sinna-api)  
**Service ID:** `srv-d3hv3lhgv73c73e16jcg`  
**Current Setting:** `autoDeploy: "no"`  
**Desired Setting:** `autoDeploy: "yes"` (on commits to `main` branch)

**Other Services:**
- ✅ `sinna1.0-Worker` - Already has auto-deploy enabled
- ❌ `sinna1.0` (API) - Auto-deploy disabled

---

## 📋 Step-by-Step Setup

### Option 1: Enable via Render Dashboard (Recommended)

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
   - Or navigate: Dashboard → `sinna1.0` service

2. **Open Settings:**
   - Click on the **Settings** tab

3. **Enable Auto-Deploy:**
   - Find the **Auto-Deploy** section
   - Toggle **"Auto-Deploy"** to **ON**
   - Select **"On commits to branch: main"**
   - Click **Save Changes**

4. **Verify:**
   - The service should now show "Auto-Deploy: On" in the overview
   - Next push to `main` branch will trigger automatic deployment

---

### Option 2: Update via Render API (Advanced)

If you prefer using the API or want to automate this:

```bash
# You'll need your Render API key
# Get it from: https://dashboard.render.com/account/api-keys

curl -X PATCH "https://api.render.com/v1/services/srv-d3hv3lhgv73c73e16jcg" \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "autoDeploy": "yes",
    "autoDeployTrigger": "commit",
    "branch": "main"
  }'
```

---

## ✅ Verification

After enabling auto-deploy:

1. **Check Service Status:**
   - Go to service dashboard
   - Verify "Auto-Deploy" shows as **"On"**
   - Verify branch is set to **"main"**

2. **Test Auto-Deploy:**
   - Make a small change (e.g., update README)
   - Commit and push to `main` branch:
     ```bash
     git add README.md
     git commit -m "test: verify auto-deploy"
     git push origin main
     ```
   - Go to Render Dashboard → Deploys
   - You should see a new deploy triggered automatically
   - Deploy should complete successfully

---

## 🔄 Alternative: Update render.yaml to Match Current State

If you prefer to keep auto-deploy **disabled** (manual deployments only):

1. Update `render.yaml`:
   ```yaml
   services:
     - type: web
       name: sinna-api
       # ... other config ...
       autoDeploy: false  # Changed from true
   ```

2. Commit the change:
   ```bash
   git add render.yaml
   git commit -m "docs: disable auto-deploy in render.yaml"
   git push origin main
   ```

**Note:** This is **not recommended** for production. Auto-deploy ensures you always have the latest code deployed.

---

## 📊 Service Configuration Comparison

| Setting | render.yaml | Current Service | Action Needed |
|---------|-------------|-----------------|---------------|
| Auto-Deploy | `true` | `no` | ⚠️ Enable in dashboard |
| Branch | `main` | `main` | ✅ Matches |
| Build Command | ✅ Matches | ✅ Matches | ✅ OK |
| Start Command | ✅ Matches | ✅ Matches | ✅ OK |

---

## 🎯 Benefits of Auto-Deploy

**With Auto-Deploy Enabled:**
- ✅ Automatic deployments on every push to `main`
- ✅ No manual intervention needed
- ✅ Faster time to production
- ✅ Consistent deployment process

**With Auto-Deploy Disabled:**
- ❌ Manual deployment required for each change
- ❌ Risk of deploying stale code
- ❌ Slower deployment cycle
- ⚠️ More control over when deployments happen

---

## 🆘 Troubleshooting

### Auto-Deploy Not Triggering

1. **Check Branch:**
   - Ensure you're pushing to `main` branch (not `master` or other branches)
   - Verify service is configured for `main` branch

2. **Check Service Connection:**
   - Verify service is connected to GitHub repository
   - Go to Settings → Source
   - Repository should show: `ikennaokekek/sinna1.0`

3. **Check Render Webhook:**
   - GitHub → Repository → Settings → Webhooks
   - Should see Render webhook configured
   - Recent deliveries should show successful requests

4. **Check Service Status:**
   - Ensure service is not suspended
   - Check for any error messages in Render dashboard

### Deploy Fails After Enabling Auto-Deploy

1. **Check Build Logs:**
   - Go to Deploys → Latest deploy → Build logs
   - Look for error messages

2. **Check Environment Variables:**
   - Ensure all required env vars are set
   - Verify secrets are configured correctly

3. **Check Build Command:**
   - Verify build command matches your setup
   - Check for dependency issues

---

## ✅ Completion Checklist

- [ ] Enabled auto-deploy in Render Dashboard
- [ ] Verified branch is set to `main`
- [ ] Tested auto-deploy with a test commit
- [ ] Verified deployment completes successfully
- [ ] Confirmed service is running after deploy

---

## 📝 Quick Reference

**Service Dashboard:**
```
https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
```

**Settings Path:**
```
Dashboard → sinna1.0 → Settings → Auto-Deploy
```

**Expected Behavior:**
- Push to `main` → Automatic deploy triggered
- Deploy appears in Deploys tab within seconds
- Build and deploy complete automatically

---

**Setup Date:** 2025-01-27  
**Status:** Ready for setup - Follow Option 1 above

