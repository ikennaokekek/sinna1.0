# Standard Plan Limits Analysis

## 📊 Current Discrepancy

### Code Implementation (Current):
```typescript
standard: { 
  minutesCap: 1000,      // Total minutes processed per month
  jobsCap: 1000,          // Total jobs per month (any type)
  egressCapBytes: 50 * GIB // 50GB storage per month
}
```

**How it works:**
- Each job consumes 1 from the `jobsCap` (regardless of type)
- Minutes are tracked separately (video duration processed)
- Storage is tracked separately (bytes uploaded/downloaded)

### README Documentation (Proposed):
```
Standard Plan:
- 2,500 transcription minutes
- 1,250 audio description minutes  
- 2,000 color analysis requests
```

**How it would work:**
- Separate limits per job type
- More granular tracking
- More complex to implement

---

## 🎯 Which is More Sustainable?

### **Code Implementation (1000/1000/50GB) is MORE SUSTAINABLE** ✅

**Reasons:**

1. **Simpler Tracking**
   - One job counter for all types
   - One minutes counter for all processing
   - Easier to understand and maintain

2. **More Flexible**
   - Customers can use their quota however they want
   - If they do more transcription, they can do less audio description
   - No rigid limits per job type

3. **Better API Experience**
   - One API call = one job (simple)
   - Minutes tracked automatically based on video duration
   - No need to track different job types separately

4. **Easier to Scale**
   - Can adjust overall limits without complex recalculation
   - Works well for new job types you might add later
   - Less code complexity

5. **Industry Standard**
   - Most APIs use unified limits (like AWS, Google Cloud)
   - Customers understand "1000 jobs/month" better than separate limits

---

## 💡 Recommendation: Keep Code Implementation

**Standard Plan Should Be:**
- **1000 minutes/month** - Total video processing time
- **1000 jobs/month** - Total jobs (any combination of captions/AD/color)
- **50GB storage/month** - Total storage used

**Why this works:**
- 1 job = 1 video processed (captions + AD + color analysis)
- If video is 5 minutes → consumes 5 minutes + 1 job
- More transcription-heavy customers can use more minutes
- More color-analysis-heavy customers can use more jobs
- Fair and flexible

**Example Usage:**
- Customer processes 200 videos (each 5 minutes)
- Uses: 200 jobs + 1000 minutes + ~10GB storage
- Within limits ✅

---

## 📝 Update Needed

The README documentation should be updated to match the code implementation for consistency.

---

## 🔄 How It Affects Connected APIs

### Current Implementation (Code):
```
POST /v1/jobs → Creates 3 sub-jobs (captions, AD, color)
- Consumes: 1 job from quota
- Minutes tracked separately based on video duration
- Storage tracked separately based on file sizes
```

**API Impact:**
- ✅ Simple to track
- ✅ One API call = one job
- ✅ Usage limits enforced automatically
- ✅ Easy to report to customers

### If Changed to README Style:
```
POST /v1/jobs → Creates 3 sub-jobs
- Would need: Separate counters for captions/AD/color
- More complex tracking logic
- More database queries
- More complex usage reporting
```

**API Impact:**
- ❌ More complex code
- ❌ More database tables/queries
- ❌ Harder to explain to customers
- ❌ Less flexible for future features

---

## ✅ Final Recommendation

**Keep the code implementation (1000/1000/50GB)** - it's simpler, more flexible, and more sustainable long-term.

Update the README to reflect the actual implementation.

