import { sha256 } from './eicValidation';

export const EIC_PROTOCOL = {
  version: 'SINNA-EIC-1/1.0.0',
  timeoutMs: 240_000,
  presets: ['deaf', 'epilepsy_flash', 'epilepsy_noise'],
  requiredRealArtifacts: ['captions', 'color', 'videoTransform'],
  disabledSteps: { ad: 'NOT_APPLICABLE_DISABLED; never a passed AD validation' },
  acceptance: {
    deaf: { cueTiming: 'finite, ordered start/end within media duration', content: 'expert agreement pending',
      visibleOverlay: 'retained frames plus independent human inspection required; approval pending' },
    epilepsy_flash: { maximumLuminanceDelta: 'decreases', rapidHighDeltaTransitions: 'decreases',
      meaning: 'engineering proxy, NOT epilepsy-safety certification' },
    epilepsy_noise: { peak: 'decreases', rmsRange: 'decreases', sampleRateHz: 48_000,
      windowMs: 100, counts: 'before and after equal', truePeakCeilingDbtp: -2,
      independentTruePeakToleranceDb: 0.01, downloadableAudio: '48 kHz AAC' },
  },
  qualification: 'Synthetic engineering success alone is not representative-environment TRL-5 evidence',
} as const;
export const protocolSha256 = sha256(JSON.stringify(EIC_PROTOCOL));

function timestamp(text: string): number {
  const parts = text.replace(',', '.').split(':').map(Number);
  if (parts.length !== 3 || parts.some(v => !Number.isFinite(v)) || parts[1] >= 60 || parts[2] >= 60) {
    throw new Error('invalid caption timestamp');
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
export function inspectCaptions(vtt: string, duration: number) {
  if (!vtt.startsWith('WEBVTT') || !Number.isFinite(duration) || duration <= 0) throw new Error('invalid VTT or duration');
  const cues = [...vtt.matchAll(/(\d{2,}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[.,]\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g)]
    .map(match => ({ start: timestamp(match[1]), end: timestamp(match[2]), text: match[3].replace(/<[^>]+>/g, '').trim() }));
  if (!cues.length || cues.some((cue, i) => cue.start < 0 || cue.end <= cue.start || cue.end > duration + 0.05
    || !cue.text || (i > 0 && cue.start < cues[i - 1].start))) throw new Error('caption timing/content engineering check failed');
  return { cueCount: cues.length, firstCueStartSeconds: cues[0].start,
    lastCueEndSeconds: cues.at(-1)!.end, characterCount: cues.reduce((n, cue) => n + cue.text.length, 0),
    timingEngineeringStatus: 'PASSED', contentQualityStatus: 'PENDING_EXPERT_AGREEMENT',
    visibleOverlayStatus: 'PENDING_INDEPENDENT_INSPECTION' };
}
export function blockedPresetResults(blockers: string[], at = new Date().toISOString()) {
  if (!blockers.length) throw new Error('blocked assessment requires explicit blockers');
  return EIC_PROTOCOL.presets.map(preset => ({
    preset, assessedAt: at, protocol: EIC_PROTOCOL.version, protocolSha256,
    realExecution: 'NOT_TESTED', engineeringStatus: 'BLOCKED',
    representativeEnvironment: 'NOT_ESTABLISHED', independentReview: 'PENDING',
    blockers, skippedChecks: ['media processing', 'downloaded-output inspection', 'tenant signing'],
    trl5: 'NOT_ESTABLISHED',
  }));
}