# Sinna 1.0: Video Transformation for Pre-Recorded Content

## 🎯 Your Use Case (Clarified)

**Scenario:** 
- RTE Player has Game of Thrones (pre-recorded show)
- User with color blindness wants to watch it
- User selects "Color Blind Safe" option in RTE Player
- RTE Player calls Sinna API
- Sinna processes the video and creates a **color-blind-friendly version**
- User watches the transformed video

**This is NOT live streaming** - it's **on-demand video transformation** for pre-recorded content.

---

## 🔍 Current Implementation vs. What You Need

### Current Implementation:

**What Sinna Does Now:**
1. ✅ Receives video URL from streaming platform
2. ✅ Processes video (captions, audio description, color analysis)
3. ✅ Generates **separate artifacts**:
   - VTT files (subtitles)
   - MP3 files (audio description)
   - JSON files (color analysis report)
4. ❌ **Does NOT transform the actual video**

**What Gets Generated:**
- Captions: Separate subtitle file (VTT)
- Audio Description: Separate audio file (MP3)
- Color Analysis: Report about colors (JSON)
- **Video**: Original video unchanged

**Presets Exist But Don't Transform:**
- `colorProfile: "colorblind-safe"` - Only used in analysis, not video transformation
- `motionReduce: true` - Flag exists but video not modified
- `strobeReduce: true` - Flag exists but video not modified

### What You Need:

**Video Transformation Pipeline:**
1. ✅ Receive video URL from streaming platform
2. ✅ Apply preset-based transformations:
   - **Color adjustment** for color blindness
   - **Motion reduction** for ADHD
   - **Strobe reduction** for motion sensitivity
   - **Other accessibility adjustments**
3. ✅ Generate **transformed video file**
4. ✅ Upload transformed video to storage
5. ✅ Return transformed video URL

**What Should Be Generated:**
- Captions: Separate subtitle file (VTT) ✅
- Audio Description: Separate audio file (MP3) ✅
- Color Analysis: Report (JSON) ✅
- **Transformed Video**: Modified video file ❌ **MISSING**

---

## 📊 Gap Analysis

| Feature | Your Need | Current Implementation | Status |
|---------|-----------|----------------------|--------|
| **Color Blind Video** | Transform video colors | Only analyzes colors | ❌ Missing |
| **Motion Reduction** | Reduce motion in video | Flag exists, not implemented | ❌ Missing |
| **Strobe Reduction** | Reduce strobe effects | Flag exists, not implemented | ❌ Missing |
| **Video Transformation** | Create modified video file | Only generates artifacts | ❌ Missing |
| **Preset-Based Processing** | Apply presets to video | Presets exist but not used | ❌ Missing |

---

## 🛠️ What Needs to Be Built

### 1. Video Transformation Worker

**New Worker Queue:** `video-transform`

**Required Capabilities:**
- Download video from URL
- Apply color transformations (using FFmpeg or Cloudinary)
- Apply motion reduction filters
- Apply strobe reduction filters
- Encode transformed video
- Upload transformed video to R2
- Return transformed video URL

### 2. Video Processing Library

**Options:**
- **FFmpeg** (most flexible, requires server setup)
- **Cloudinary** (already integrated, can do transformations)
- **AWS MediaConvert** (scalable, but more complex)

**Recommended:** Use **Cloudinary** since you already have it configured!

### 3. Preset-Based Transformation Logic

**Map Presets to Video Transformations:**

```typescript
{
  "colorblind-safe": {
    videoTransform: {
      colorspace: "srgb",
      colorAdjustments: { /* color blind filters */ }
    }
  },
  "adhd": {
    videoTransform: {
      motionReduce: true,
      speed: 1.1
    }
  },
  "motion": {
    videoTransform: {
      motionReduce: true,
      strobeReduce: true
    }
  }
}
```

### 4. API Endpoint Updates

**New Endpoint:**
```typescript
POST /v1/jobs
{
  "source_url": "https://rte-player.com/game-of-thrones.mp4",
  "preset_id": "color",  // or "adhd", "motion", etc.
  "transform_video": true  // NEW: Request video transformation
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job-123",
    "steps": {
      "captions": "...",
      "ad": "...",
      "color": "...",
      "video_transform": "..."  // NEW: Transformed video URL
    },
    "transformed_video_url": "https://r2.sinna.com/videos/transformed-123.mp4"
  }
}
```

---

## ✅ What You Already Have (Foundation)

1. ✅ **API Infrastructure** - Fastify API ready
2. ✅ **Worker System** - BullMQ queues working
3. ✅ **Storage** - R2 configured and working
4. ✅ **Presets System** - Presets defined in `config/presets.json`
5. ✅ **Cloudinary** - Already configured (can do video transformations!)
6. ✅ **Job Pipeline** - Captions → AD → Color pipeline works

**What's Missing:**
- Video transformation logic
- Video processing worker
- Preset-to-transformation mapping

---

## 🚀 Implementation Plan

### Phase 1: Add Video Transformation Worker

1. **Create `video-transform` worker queue**
   - Use Cloudinary for video transformations
   - Apply preset-based transformations
   - Upload transformed video to R2

2. **Update Preset System**
   - Map presets to Cloudinary transformation parameters
   - Color blindness → Color space adjustments
   - ADHD → Motion reduction filters
   - Motion sensitivity → Strobe reduction filters

3. **Update API**
   - Add `transform_video` option to job creation
   - Return transformed video URL in job status

### Phase 2: Enhanced Transformations

1. **More Preset Options**
   - Contrast adjustments
   - Brightness adjustments
   - Custom color profiles

2. **Performance Optimization**
   - Cache transformed videos
   - Batch processing
   - Progressive encoding

---

## 💡 Quick Win: Use Cloudinary

**Since you already have Cloudinary configured**, you can leverage it for video transformations:

```typescript
// Example: Color blind transformation
const transformedUrl = cloudinary.video('game-of-thrones.mp4')
  .quality('auto')
  .format('mp4')
  .colorSpace('srgb')
  .toURL();
```

**Cloudinary can:**
- ✅ Transform colors (color space adjustments)
- ✅ Reduce motion (frame rate adjustments)
- ✅ Apply filters (accessibility filters)
- ✅ Process videos serverlessly

**This is the fastest path to video transformation!**

---

## 📝 Summary

**Question:** Can Sinna transform pre-recorded videos for color blindness/ADHD?

**Answer:** ❌ **Not yet** - Currently only generates artifacts, doesn't transform videos.

**What You Have:**
- ✅ Solid foundation (API, Worker, Storage, Presets)
- ✅ Cloudinary configured (can do transformations!)
- ✅ Presets defined (just need to map to transformations)

**What You Need:**
- Video transformation worker
- Preset-to-transformation mapping
- Transformed video storage and delivery

**Next Step:** Implement video transformation using Cloudinary (since it's already configured)!

---

## 🎯 Example Flow (After Implementation)

```
1. User selects "Color Blind Safe" in RTE Player
   ↓
2. RTE Player calls Sinna API:
   POST /v1/jobs
   {
     "source_url": "https://rte-player.com/got-s01e01.mp4",
     "preset_id": "color",
     "transform_video": true
   }
   ↓
3. Sinna Worker:
   - Downloads video
   - Applies color-blind transformations (via Cloudinary)
   - Uploads transformed video to R2
   ↓
4. Sinna API returns:
   {
     "transformed_video_url": "https://r2.sinna.com/videos/got-colorblind-s01e01.mp4",
     "captions": "...",
     "audio_description": "..."
   }
   ↓
5. RTE Player serves transformed video to user
   User watches color-blind-friendly version! ✅
```

**This is exactly what you want - just needs to be built!**

