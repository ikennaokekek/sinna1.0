# Deployment Verification Script

This script verifies that the API endpoints are working correctly after deployment.

## Deployment Status

**Commit:** `79cfe5e` - "fix: Make /v1/demo public and expose Swagger routes"  
**Pushed to:** `main` branch  
**Render Auto-Deploy:** Enabled (`autoDeploy: true`)

## Verification Steps

### 1. Wait for Deployment (2-5 minutes)

Render typically takes 2-5 minutes to:
- Build the application
- Deploy to production
- Health checks to pass

### 2. Test Endpoints

Run these commands to verify:

```bash
# Test demo endpoint (should work without auth)
curl https://sinna.site/v1/demo
# Expected: {"ok":true,"now":"2024-..."}

# Test Swagger JSON (should list all endpoints)
curl -s https://sinna.site/api-docs/json | jq '.paths | keys'
# Expected: ["/health", "/v1/jobs", "/v1/demo", "/v1/me/usage", ...]

# Test Swagger UI (should load)
curl -I https://sinna.site/api-docs
# Expected: HTTP/2 200

# Count documented endpoints
curl -s https://sinna.site/api-docs/json | jq '.paths | length'
# Expected: 13+ endpoints
```

### 3. Check Deployment Status

Monitor deployment in Render Dashboard:
- Go to: https://dashboard.render.com
- Open `sinna-api` service
- Check "Events" tab for deployment status
- Look for "Deploy succeeded" message

## Expected Results

| Endpoint | Expected Status | Expected Response |
|----------|----------------|-------------------|
| `/v1/demo` | ✅ 200 | `{"ok":true,"now":"2024-..."}` |
| `/api-docs/json` | ✅ 200 | JSON with `paths` object |
| `/api-docs` | ✅ 200 | HTML Swagger UI |
| `/health` | ✅ 401 | `{"code":"unauthorized"}` (requires API key) |

## Troubleshooting

### If endpoints still return 401/empty paths:

1. **Check deployment status** in Render dashboard
2. **Check build logs** for errors
3. **Verify environment variables** are set correctly
4. **Wait 2-3 more minutes** for full propagation

### If deployment fails:

1. Check Render build logs for errors
2. Verify all environment variables are set
3. Check that `BASE_URL` is set to `https://sinna.site`
4. Verify Redis and R2 credentials are correct

---

**Deployment Initiated:** $(date +"%Y-%m-%d %H:%M:%S")

