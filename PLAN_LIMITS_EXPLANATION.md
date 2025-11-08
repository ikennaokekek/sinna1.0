# Plan Limits Explanation

## 📊 The Two Approaches Explained

### Approach 1: Code Implementation (Current - 1000/1000/50GB)

**What it means:**
- **1000 minutes/month**: Total video processing time across all jobs
- **1000 jobs/month**: Total number of jobs (each job = 1 video processed)
- **50GB storage/month**: Total storage used for artifacts

**How it works:**
1. Customer submits a video → Creates 1 job (consumes 1 from quota)
2. Video is 5 minutes long → Consumes 5 minutes from quota
3. Worker processes captions + audio description + color analysis
4. Artifacts stored → Consumes storage based on file sizes

**Example:**
- Customer processes 200 videos (each 5 minutes)
- Uses: 200 jobs + 1000 minutes + ~10GB storage
- Within limits ✅

### Approach 2: README Documentation (Proposed - Separate Limits)

**What it means:**
- **2,500 transcription minutes**: Only for caption generation
- **1,250 audio description minutes**: Only for audio description
- **2,000 color analysis requests**: Only for color analysis

**How it would work:**
1. Customer submits a video → Creates 3 separate jobs
2. Each job type has its own limit
3. If transcription limit reached, can't do more captions (but can still do AD/color)
4. More complex tracking needed

**Example:**
- Customer processes 200 videos for captions (each 5 min)
- Uses: 1000 transcription minutes (within 2,500 limit) ✅
- But also uses: 200 audio description minutes + 200 color analysis jobs
- Different limits for each type

---

## 🎯 Which is More Sustainable?

### **Code Implementation (1000/1000/50GB) is MORE SUSTAINABLE** ✅

**Why:**

1. **Simpler for Customers**
   - Easy to understand: "1000 jobs and 1000 minutes per month"
   - No confusion about which limit applies to which feature
   - Can use quota however they want

2. **Simpler for You**
   - One tracking system instead of three
   - Less code complexity
   - Easier to maintain and debug
   - Less database queries

3. **More Flexible**
   - Customer can do 1000 caption jobs OR 500 caption + 500 AD jobs
   - Not locked into rigid per-type limits
   - Better user experience

4. **Better API Design**
   - One API endpoint creates one job
   - Simple usage tracking
   - Industry standard approach (like AWS, Google Cloud)

5. **Easier to Scale**
   - Can adjust overall limits easily
   - Works well when you add new features
   - Less code changes needed

---

## 💰 Cost Analysis

### Current Implementation:
- **Processing Cost**: Based on total minutes (AssemblyAI + OpenAI)
- **Storage Cost**: Based on total storage (Cloudflare R2)
- **Job Cost**: Overhead per job (database, queue)

**Cost per customer:**
- 1000 minutes ≈ $50-100/month (AssemblyAI + OpenAI)
- 50GB storage ≈ $1-2/month (Cloudflare R2)
- 1000 jobs overhead ≈ negligible
- **Total cost per customer: ~$50-100/month**
- **Revenue: $1,500/month**
- **Margin: ~93%** ✅

### If Changed to README Style:
- Would need separate tracking for each job type
- More complex code = more maintenance cost
- Same actual costs, but harder to manage
- **Margin: Same, but more complexity** ❌

---

## 🔄 How It Affects Connected APIs

### Current Implementation (Code):

**API Flow:**
```
POST /v1/jobs → Creates job bundle
  ↓
Enqueues 3 sub-jobs (captions, AD, color)
  ↓
Worker processes each sub-job
  ↓
Updates usage: +1 job, +minutes, +storage
```

**API Impact:**
- ✅ Simple: One API call = one job
- ✅ Usage gating: Single check against limits
- ✅ Reporting: Easy to show "X jobs used, Y minutes used"
- ✅ Flexible: Customer uses quota how they want

### If Changed to README Style:

**API Flow:**
```
POST /v1/jobs → Creates job bundle
  ↓
Enqueues 3 sub-jobs
  ↓
Worker processes each sub-job
  ↓
Updates usage: +1 caption job, +1 AD job, +1 color job
  ↓
Need separate checks for each type
```

**API Impact:**
- ❌ Complex: Need to track 3 different counters
- ❌ Usage gating: Three separate checks needed
- ❌ Reporting: More complex usage reports
- ❌ Less flexible: Rigid limits per type

---

## 📊 Real-World Example

### Scenario: Customer processes 200 videos/month

**Current Implementation:**
- Jobs used: 200/1000 ✅
- Minutes used: 1000/1000 ✅
- Storage used: 10GB/50GB ✅
- **Status: Within limits, can continue**

**README Style (if implemented):**
- Transcription minutes: 1000/2500 ✅
- Audio description minutes: 1000/1250 ✅
- Color analysis: 200/2000 ✅
- **Status: Within limits, but more complex**

**Which is easier to understand?**
- Current: "You've used 200 of 1000 jobs" ✅
- README: "You've used 1000 transcription minutes, 1000 AD minutes, 200 color jobs" ❌

---

## ✅ Final Recommendation

**Keep the code implementation (1000/1000/50GB)** because:

1. ✅ **Simpler** - Easier to understand and maintain
2. ✅ **More flexible** - Customers can use quota however they want
3. ✅ **Better API design** - Industry standard approach
4. ✅ **Easier to scale** - Less complexity when adding features
5. ✅ **Same costs** - No difference in actual API costs
6. ✅ **Better UX** - Easier for customers to understand

**Action:** Update README documentation to match the code implementation.

---

## 🔧 Technical Details

### How Minutes Are Tracked:
- Each video job tracks the video duration
- Minutes consumed = total video duration processed
- Example: 5-minute video = 5 minutes consumed

### How Jobs Are Tracked:
- Each `/v1/jobs` API call = 1 job
- Job includes captions + audio description + color analysis
- All three sub-jobs count as 1 job

### How Storage Is Tracked:
- Each artifact (subtitles, audio, color report) stored in R2
- Storage tracked by total bytes uploaded
- Includes all artifacts generated

---

**Conclusion: The code implementation is more sustainable and should be kept. Update documentation to match.**

