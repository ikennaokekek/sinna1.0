# PRESETS

This document defines processing presets for Sinna1.0. Each preset toggles a set of accessibility-oriented behaviors.

## Presets

### everyday
- Enables balanced defaults for general audiences
- Subtitle format: VTT
- Max transcription length per job: 60 minutes
- Standard punctuation, filler-word removal minimal

### adhd
- Increased paragraph breaks
- Faster TTS playback option (1.1x)
- Stronger summarization of long silence sections
- Clearer cueing for topic changes

### autism
- Reduced sudden audio effects in TTS (gentler prosody)
- More explicit visual descriptions
- Avoid idioms and ambiguous phrasing in generated text

### low_vision
- High-contrast color recommendations
- Larger default font sizes in guidance
- Prefer bold outline around keyframes for thumbnails

### color
- Color-blind safe palette recommendations
- Contrast verification on key frames
- Warnings for problematic color combinations

### hoh (hard of hearing)
- More complete sound effect captions (e.g., [door slams])
- Speaker labels included
- Emphasis on non-speech cues

### cognitive
- Simplified language mode
- Shorter sentences and bullet-structured summaries
- Explicit step-by-step descriptions

### motion
- Motion sensitivity adaptation
- Warnings for rapid scene changes
- Recommend reduced-motion alternatives where possible
