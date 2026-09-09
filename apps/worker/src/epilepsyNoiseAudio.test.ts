import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEpilepsyNoiseAudioFilters,
  encodeEpilepsyNoiseWithTruePeakGate,
  EPILEPSY_NOISE_SAMPLE_RATE_HZ,
  EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP,
  measureEncodedTruePeakDbtp,
  nextEpilepsyNoiseLimitDbfs,
} from './epilepsyNoiseAudio';
import { measureAudioDynamics } from './epilepsyEvidence';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('epilepsy_noise audio pipeline', () => {
  it('preserves dynamics processing, normalizes to 48 kHz, and limits after loudness normalization', () => {
    const filters = buildEpilepsyNoiseAudioFilters(-3);
    expect(filters).toContain('highpass=f=80');
    expect(filters).toContain('lowpass=f=12000');
    expect(filters.some((filter) => filter.startsWith('acompressor='))).toBe(true);
    expect(filters.some((filter) => filter.startsWith('dynaudnorm='))).toBe(true);
    expect(filters.findIndex((filter) => filter.startsWith('loudnorm=')))
      .toBeLessThan(filters.findIndex((filter) => filter.startsWith('alimiter=')));
    expect(filters.find((filter) => filter.startsWith('alimiter='))).toContain('level=false');
    expect(filters.at(-1)).toBe(`aresample=${EPILEPSY_NOISE_SAMPLE_RATE_HZ}`);
  });

  it('lowers the final limiter by the measured overshoot plus safety margin', () => {
    expect(nextEpilepsyNoiseLimitDbfs(-3, -1.2)).toBe(-4.3);
  });

  it('reprocesses an over-ceiling encode and accepts only a verified retry', async () => {
    const encodedFilters: string[][] = [];
    const measuredPeaks = [-1.2, -2.4];
    const result = await encodeEpilepsyNoiseWithTruePeakGate({
      encode: async (filters) => {
        encodedFilters.push(filters);
      },
      measureTruePeakDbtp: async () => measuredPeaks.shift()!,
    });

    expect(result).toEqual({ encodedTruePeakDbtp: -2.4, encodeAttempts: 2 });
    expect(encodedFilters).toHaveLength(2);
    expect(encodedFilters[1].find((filter) => filter.startsWith('alimiter=')))
      .toContain('limit=0.609537');
  });

  it('measures fixed 100 ms windows and true peak from an encoded 48 kHz AAC/MP4', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sinna-noise-test-'));
    tempDirs.push(dir);
    const output = path.join(dir, 'encoded.mp4');
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=8000:duration=1',
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-af', buildEpilepsyNoiseAudioFilters(-3).join(','),
      '-c:a', 'aac', '-ar', '48000', '-shortest',
      output,
    ]);

    const metrics = await measureAudioDynamics(output);
    const truePeak = await measureEncodedTruePeakDbtp(output);
    expect(metrics.sampleRateHz).toBe(48_000);
    expect(metrics.windowDurationMs).toBe(100);
    // AAC priming/padding may add one final fixed-duration decoded window.
    expect(metrics.sampledAudioWindows).toBeGreaterThanOrEqual(10);
    expect(metrics.sampledAudioWindows).toBeLessThanOrEqual(11);
    expect(metrics.truePeakDbtp).toBe(truePeak);
    expect(truePeak).toBeLessThanOrEqual(EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP);
  }, 30_000);
});