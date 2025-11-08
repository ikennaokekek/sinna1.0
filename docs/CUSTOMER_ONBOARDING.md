# Sinna API Onboarding — Be Accessible in Minutes

Welcome to Sinna. In a few minutes you’ll be able to transform your videos for accessibility with captions, audio descriptions, color-safe palettes, and more — all from a single API.

## What You’ll Get
- A production API key delivered to your inbox after checkout
- A simple REST API at `https://sinna.site`
- Eight accessibility presets ready to use (e.g., `blindness`, `deaf`, `color_blindness`, `adhd`, `autism`, `epilepsy_flash`, `epilepsy_noise`, `cognitive_load`)
- Signed R2 URLs for your processed artifacts

---

## 1) Subscribe (Standard plan $2,000/month)
- Reach out for a checkout link or use your existing sales link.
- Complete Stripe checkout.
- Our Stripe webhook will automatically create a tenant and generate your API key.
- You’ll receive an email: subject “Your Sinna API Key is Ready!”

If you didn't receive your key within a few minutes, check spam or contact support at motion24inc@gmail.com.

---

## 2) Verify Your API Key
Your key starts with `sk_live_`. Keep it secret.

Quick smoke test:

```bash
curl -H "X-API-Key: sk_live_YOUR_API_KEY" \
  https://sinna.site/v1/demo
```

Expected response:
```json
{
  "ok": true,
  "now": "2025-01-01T12:00:00.000Z"
}
```

---

## 3) Create Your First Job
Send a video URL and (optionally) a preset. We’ll queue the pipeline (captions → audio description → color analysis → optional video transform) and give you a job ID to poll.

```bash
curl -X POST https://sinna.site/v1/jobs \
  -H "X-API-Key: sk_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "preset_id": "everyday"
  }'
```

Example response (truncated):
```json
{
  "success": true,
  "data": {
    "id": "job_abc123",
    "steps": {
      "captions": "cap_...",
      "ad": "ad_...",
      "color": "color_...",
      "videoTransform": "vt_..." // included if your preset enables it
    },
    "preset": "everyday"
  }
}
```

---

## 4) Poll for Status and Download Artifacts
Poll until `status` becomes `completed`. When a step is done, you’ll get signed R2 URLs for artifacts.

```bash
curl https://sinna.site/v1/jobs/job_abc123 \
  -H "X-API-Key: sk_live_YOUR_API_KEY"
```

When complete, look for:
- Captions (VTT)
- Audio description (MP3)
- Color analysis (JSON)
- Transformed video (signed URL) when preset uses `videoTransform`

---

## 5) Pick the Right Preset
Use a preset to tailor the pipeline to your audience:

- `blindness`: Mix audio descriptions into the original soundtrack
- `deaf`: Burned captions + volume boost
- `color_blindness`: Color-safe palette
- `adhd`: Motion reduction + subtle focus
- `autism`: Lower strobe + muted color
- `epilepsy_flash`: Flash/frame reduction
- `epilepsy_noise`: Low-pass audio smoothing
- `cognitive_load`: Simpler contrast + slower cuts

Example with a preset:
```bash
curl -X POST https://sinna.site/v1/jobs \
  -H "X-API-Key: sk_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://example.com/video.mp4",
    "preset_id": "deaf"
  }'
```

---

## 6) Plan, Limits, and Throughput
Standard plan ($2,000/month):
- 1,000 jobs/month (any combination)
- 1,000 minutes processed/month
- 50GB storage/month
- 120 requests/minute per key (rate limiting)

For larger workloads, upgrade to Pro or talk to us about Enterprise.

---

## 7) Operational Footnotes
- Authentication: `X-API-Key: sk_live_...`
- Artifacts: Returned as signed R2 URLs
- Retries: The system auto-retries transient errors; re-submit the job if it fails persistently
- Idempotency: Duplicate `source_url + preset + tenant` are deduped automatically for a short window

---

## 8) Next Steps
- Browse interactive docs: `https://sinna.site/api-docs`
- Run production verification: `./scripts/verify-production.sh`
- Set up uptime monitoring (guide: `docs/UPTIME_MONITORING_SETUP.md`)
- Configure DNS/SSL (guide: `docs/SSL_DOMAIN_SETUP.md`)

If you need a hand, reply to your API key email — we’ll help you get live fast.

