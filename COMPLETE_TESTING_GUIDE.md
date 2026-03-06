# 🧪 Complete End-to-End Testing Guide

**Purpose:** Test the entire customer journey from Stripe payment to viewing preset results

---

## 📋 Prerequisites

Before starting, ensure you have:

1. ✅ **Stripe Account** with API keys
2. ✅ **Render Service** running and accessible
3. ✅ **Test Email** ready (for receiving API key)
4. ✅ **Environment Variables** (optional - script will guide you)

---

## 🚀 Quick Start

### Option 1: Automated Test Script (Recommended)

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Set your test email (optional)
export TEST_EMAIL="your-email@example.com"

# Run the complete test workflow
pnpm tsx scripts/test-complete-workflow.ts
```

The script will:
1. ✅ Test API health
2. ✅ Create Stripe checkout (if needed)
3. ✅ Guide you through payment
4. ✅ Test all 13 presets
5. ✅ Generate a report

---

### Option 2: Manual Step-by-Step Testing

Follow the detailed steps below for manual testing.

---

## 📝 Step-by-Step Testing Process

### Phase 1: Stripe Payment & API Key Setup

#### Step 1.1: Create Stripe Checkout Session

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Set environment variables (get from Render dashboard)
export STRIPE_SECRET_KEY="sk_test_..." # or sk_live_...
export STRIPE_STANDARD_PRICE_ID="price_..."
export TEST_EMAIL="your-email@example.com"

# Create checkout
pnpm tsx scripts/create-test-checkout-now.ts
```

**Expected Output:**
```
✅ TEST CHECKOUT SESSION CREATED!
🔗 CHECKOUT URL: https://checkout.stripe.com/...
💳 Test Card: 4242 4242 4242 4242
```

#### Step 1.2: Complete Payment

1. **Open the checkout URL** from Step 1.1
2. **Enter your email** (the one you set in TEST_EMAIL)
3. **Use test card:**
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345`
4. **Complete payment**
5. **Check your email** for the API key

#### Step 1.3: Verify API Key

```bash
# Set your API key
export TEST_API_KEY="sk_live_..." # or sk_test_...

# Test the API key
curl -X GET "https://sinna1-0.onrender.com/v1/me/subscription" \
  -H "X-API-Key: $TEST_API_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "status": "active",
    "active": true
  }
}
```

---

### Phase 2: Test All Presets

#### Step 2.1: Run Automated Preset Tests

```bash
# Make sure TEST_API_KEY is set
export TEST_API_KEY="sk_live_YOUR_KEY_HERE"

# Run preset tests
pnpm tsx scripts/test-complete-workflow.ts
```

This will test all 13 presets:
- ✅ everyday
- ✅ adhd
- ✅ autism
- ✅ blindness
- ✅ deaf
- ✅ color_blindness
- ✅ epilepsy_flash
- ✅ epilepsy_noise
- ✅ low_vision
- ✅ hoh
- ✅ cognitive
- ✅ motion
- ✅ cognitive_load

#### Step 2.2: Manual Preset Test (Single Preset)

```bash
# Set variables
export TEST_API_KEY="sk_live_YOUR_KEY_HERE"
export VIDEO_URL="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
export API_BASE="https://sinna1-0.onrender.com"

# Create job
JOB_RESPONSE=$(curl -X POST "$API_BASE/v1/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $TEST_API_KEY" \
  -d "{\"source_url\": \"$VIDEO_URL\", \"preset_id\": \"adhd\"}")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.data.id')
echo "Job ID: $JOB_ID"

# Poll for completion
while true; do
  STATUS=$(curl -s "$API_BASE/v1/jobs/$JOB_ID" \
    -H "X-API-Key: $TEST_API_KEY" | jq -r '.data.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ Job completed!"
    # Get results
    curl -s "$API_BASE/v1/jobs/$JOB_ID" \
      -H "X-API-Key: $TEST_API_KEY" | jq '.data.steps'
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Job failed!"
    break
  fi
  
  sleep 5
done
```

---

### Phase 3: View Results

#### Option A: Using Widget (Visual Interface)

1. **Open widget demo:**
   ```bash
   cd /Users/ikennaokeke/Documents/SINNA1.0/widget
   python3 -m http.server 8000
   ```
   
2. **Open browser:** `http://localhost:8000/demo/index.html`

3. **Configure widget:**
   - Enter your API key
   - Enter video URL
   - Select preset
   - Click "Analyze"

4. **View results** in the widget interface

#### Option B: Direct API (Download Files)

```bash
# Get job status with URLs
curl -s "$API_BASE/v1/jobs/$JOB_ID" \
  -H "X-API-Key: $TEST_API_KEY" | jq '.data.steps'
```

**Response includes signed URLs:**
- `captions.url` - Subtitle files (VTT, SRT, TTML)
- `ad.url` - Audio description file
- `color.url` - Color analysis report
- `videoTransform.url` - Transformed video (if preset includes it)

**Download and view:**
```bash
# Download caption file
curl -o captions.vtt "SIGNED_URL_FROM_RESPONSE"

# Download transformed video (if available)
curl -o video.mp4 "VIDEO_TRANSFORM_URL_FROM_RESPONSE"

# Play in VLC or QuickTime
open captions.vtt
open video.mp4
```

---

## 📊 What to Observe for Each Preset

### Presets with Video Transformation:

1. **ADHD** - Faster playback (1.5x), motion reduction
2. **Autism** - Calmer colors, reduced motion, softer saturation
3. **Blindness** - Audio description mixed into video
4. **Deaf** - Burned-in captions, volume boost
5. **Color Blindness** - Color correction applied
6. **Epilepsy (Flash)** - Flash reduction, reduced brightness
7. **Epilepsy (Noise)** - Audio smoothing, low-pass filter
8. **Cognitive Load** - Focus highlighting

### Presets with Caption Styles:

1. **Everyday** - Standard captions
2. **ADHD** - Chunked captions
3. **Autism** - Clear captions
4. **Low Vision** - Large, high-contrast captions
5. **HOH** - Descriptive captions with sound effects
6. **Cognitive** - Simplified language captions

---

## ✅ Testing Checklist

- [ ] **Phase 1: Payment & Setup**
  - [ ] Stripe checkout created
  - [ ] Payment completed
  - [ ] API key received via email
  - [ ] API key verified (subscription active)

- [ ] **Phase 2: Preset Testing**
  - [ ] All 13 presets tested
  - [ ] Jobs created successfully
  - [ ] Jobs completed (not failed)
  - [ ] Result URLs generated

- [ ] **Phase 3: Results Verification**
  - [ ] Caption files downloadable
  - [ ] Audio description files available (where applicable)
  - [ ] Transformed videos playable (where applicable)
  - [ ] Color analysis reports readable (where applicable)

---

## 🐛 Troubleshooting

### Job Creation Fails

**Error:** `401 unauthorized`
- **Fix:** Verify API key is correct and active
- **Check:** `curl -H "X-API-Key: $TEST_API_KEY" https://sinna1-0.onrender.com/v1/me/subscription`

**Error:** `429 rate limited`
- **Fix:** Check usage limits: `curl -H "X-API-Key: $TEST_API_KEY" https://sinna1-0.onrender.com/v1/me/usage`

### Job Stuck in "processing"

- **Normal:** Jobs can take 5-10 minutes for longer videos
- **Check:** Worker logs on Render dashboard
- **Verify:** Redis/BullMQ is running

### No Video Transformation URL

- **Check:** Only some presets include video transformation
- **Verify:** Preset config in `config/presets.json`
- **Presets with videoTransform:** adhd, autism, blindness, deaf, color_blindness, epilepsy_flash, epilepsy_noise, cognitive_load

---

## 📄 Test Report

After running tests, check:
- `test-report-*.json` - Detailed test results
- Console output - Summary of all tests

---

## 🎯 Success Criteria

**All tests pass if:**
- ✅ Health check returns 200 or 401
- ✅ Stripe checkout creates successfully
- ✅ API key works for API requests
- ✅ All 13 presets create jobs successfully
- ✅ At least 80% of jobs complete successfully
- ✅ Result URLs are generated for completed jobs

---

## 📞 Next Steps

After testing:
1. Review test report
2. Fix any failed presets
3. Verify transformed videos play correctly
4. Check caption quality
5. Confirm audio descriptions work (for blindness preset)

---

**Ready to test?** Run:
```bash
pnpm tsx scripts/test-complete-workflow.ts
```



