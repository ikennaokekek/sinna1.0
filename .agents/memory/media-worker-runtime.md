---
name: Media worker runtime
description: Non-obvious runtime constraints for secure video ingestion, bounded transforms, and engineering evidence.
---

Pinned Node DNS lookups must honor the networking caller's `all: true` option and return an address array; returning the single-address callback shape can surface as `Invalid IP address: undefined`.

**Why:** The real R2-backed worker path failed even after DNS approval because Node's connection code requested all addresses. The approved address still needs to remain pinned in either callback shape.

**How to apply:** Keep redirect revalidation and address pinning, but test both lookup callback forms whenever the worker networking stack changes.

Color-blind video correction should use the bounded local FFmpeg path rather than Cloudinary's former `colorblind_correction` effect.

**Why:** That Cloudinary effect is not a compatible video transformation. The FFmpeg path was verified against a real MP4 and avoids sending an invalid provider transformation.

**How to apply:** Keep color-blind video transforms on FFmpeg unless a documented, tested Cloudinary video equivalent replaces it.

Epilepsy-oriented transform evidence must remain explicitly labeled as engineering proxy data, never medical certification or guaranteed prevention.

**Why:** Luminance-delta and short-window audio-dynamics measurements can demonstrate that a transform materially changed representative media, but they do not establish clinical safety.

**How to apply:** Preserve the non-medical disclaimer in stored evidence and investor-facing checks; require measurable before/after improvement without turning proxy thresholds into medical claims.

FFmpeg `alimiter` must disable its default automatic output leveling when it is used to preserve codec headroom, and acceptance must measure the final encoded artifact.

**Why:** Lowering the limiter threshold alone did not lower measured AAC true peak because `alimiter` defaults to leveling the result back up. AAC can also introduce post-filter overshoot.

**How to apply:** Use `level=false`, place limiting after loudness normalization, reserve conservative headroom, and fail closed or retry based on decoded post-encode true-peak measurement.