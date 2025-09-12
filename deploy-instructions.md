# 🚀 SINNA API - DEPLOYMENT INSTRUCTIONS

## Step 1: Create GitHub Repository

1. Go to [GitHub.com](https://github.com) and click "New repository"
2. Repository name: `sinna-api`
3. Description: `Advanced accessibility features API for streaming platforms`
4. Set to **Public** or **Private** (your choice)
5. **DO NOT** initialize with README (we already have one)
6. Click "Create repository"

## Step 2: Push Code to GitHub

Copy and paste these commands in your terminal:

```bash
# Add GitHub remote (replace YOUR_USERNAME with your actual GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/sinna-api.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Sign up/login with your GitHub account
3. Click **"New +"** → **"Blueprint"**
4. Select **"Connect a repository"**
5. Find and select your `sinna-api` repository
6. Render will detect the `render.yaml` file automatically
7. Click **"Apply"**

## Step 4: Add Environment Variables in Render

In the Render dashboard, go to each service and add these environment variables:

### 🔴 CRITICAL VARIABLES (Copy exactly):
```
REDIS_URL=rediss://default:AWMYAAIncDFjZGEwYTJlMGJlMjU0YzkzYjdkYjZmYmNhYmViM2VlNnAxMjUzNjg@good-owl-25368.upstash.io:6379
R2_ACCOUNT_ID=df7855d26a40bad170d0ad63c971c168
R2_ACCESS_KEY_ID=2805e41f04f4f72992872ce8cd0941e5
R2_SECRET_ACCESS_KEY=a5b80e55be0a618389c32c03db5784b2350e2593515b16bc086578c579f15721
R2_BUCKET=sinna1-0
```

### 🟡 RECOMMENDED VARIABLES (Copy exactly):
```
ASSEMBLYAI_API_KEY=e3c8fabeb964421bb79ce122c700b711
OPENAI_API_KEY=your_openai_api_key_here
CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@dhumkzsdp
SENTRY_DSN=https://a7b2f95a71fdc2aa9380b3f6230d846b@o4510008512544768.ingest.de.sentry.io/4510008525193296
PROVIDER_CAPTIONS=assemblyai_realtime
PROVIDER_TTS=openai
PROVIDER_CAPTIONS_VOD=whisper
```

### 🟢 OPTIONAL (Add later when you get them):
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Step 5: Wait for Deployment

Render will automatically:
- Build your application (`npm ci && npm run build`)
- Deploy 2 services: `sinna-api` and `sinna-worker`
- Run health checks
- Provide you with a URL like: `https://sinna-api-xyz.onrender.com`

## Step 6: Test Deployment

Once deployed, test these URLs (replace with your actual URL):

```bash
# Health check
https://your-app.onrender.com/health

# API Documentation
https://your-app.onrender.com/api-docs

# Metrics
https://your-app.onrender.com/metrics
```

## 🚨 If Something Goes Wrong

1. **Check Render logs** in the dashboard
2. **Verify environment variables** are set correctly
3. **Look for missing secrets** - the health check will tell you what's missing
4. **Contact me** if you need help debugging

## ✅ Success Indicators

Your deployment is successful when:
- ✅ Health check returns `"status": "healthy"`
- ✅ API docs are accessible
- ✅ Both services show "Deploy succeeded" in Render
- ✅ No critical errors in logs

---

**Your Sinna API will be live and ready to serve streaming platforms worldwide!** 🌍
