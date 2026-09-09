import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  EPILEPSY_NOISE_SAMPLE_RATE_HZ,
  measureEncodedTruePeakDbtp,
} from './epilepsyNoiseAudio';

const execFileAsync = promisify(execFile);
const MEASUREMENT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface FlashRiskMetrics {
  sampledFrames: number;
  maxLuminanceDelta: number;
  p95LuminanceDelta: number;
  meanLuminanceDelta: number;
  rapidHighDeltaTransitions: number;
  highDeltaThreshold: number;
}

export interface AudioDynamicsMetrics {
  sampledAudioWindows: number;
  sampleRateHz: number;
  windowDurationMs: number;
  p10RmsDbfs: number;
  p95RmsDbfs: number;
  shortWindowRmsRangeDb: number;
  maxPeakDbfs: number;
  truePeakDbtp: number;
}

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export async function measureFlashRisk(inputPath: string): Promise<FlashRiskMetrics> {
  const { stdout, stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-vf', 'fps=24,scale=64:36,signalstats,metadata=print:file=-',
    '-an', '-f', 'null', '-',
  ], {
    timeout: MEASUREMENT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const samples = [...`${stdout}\n${stderr}`.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)]
    .map((match) => Number(match[1]) / 255)
    .filter(Number.isFinite);
  if (samples.length < 2) {
    throw new Error('flash_risk_measurement_missing_samples');
  }
  const deltas = samples.slice(1).map((value, index) => Math.abs(value - samples[index]));
  const threshold = 0.25;
  return {
    sampledFrames: samples.length,
    maxLuminanceDelta: round(Math.max(...deltas)),
    p95LuminanceDelta: round(percentile(deltas, 0.95)),
    meanLuminanceDelta: round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length),
    rapidHighDeltaTransitions: deltas.filter((value) => value >= threshold).length,
    highDeltaThreshold: threshold,
  };
}

export async function measureAudioDynamics(inputPath: string): Promise<AudioDynamicsMetrics> {
  const [{ stdout, stderr }, truePeakDbtp] = await Promise.all([
    execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-af',
      `aresample=${EPILEPSY_NOISE_SAMPLE_RATE_HZ},asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=print:file=-`,
      '-f', 'null', '-',
    ], {
      timeout: MEASUREMENT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_OUTPUT_BYTES,
    }),
    measureEncodedTruePeakDbtp(inputPath),
  ]);
  const output = `${stdout}\n${stderr}`;
  const rms = [...output.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?[0-9.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const peaks = [...output.matchAll(/lavfi\.astats\.Overall\.Peak_level=(-?[0-9.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (rms.length < 2 || peaks.length < 2) {
    throw new Error('audio_dynamics_measurement_missing_summary');
  }
  const p10 = percentile(rms, 0.1);
  const p95 = percentile(rms, 0.95);
  return {
    sampledAudioWindows: rms.length,
    sampleRateHz: EPILEPSY_NOISE_SAMPLE_RATE_HZ,
    windowDurationMs: 100,
    p10RmsDbfs: round(p10, 2),
    p95RmsDbfs: round(p95, 2),
    shortWindowRmsRangeDb: round(p95 - p10, 2),
    maxPeakDbfs: round(Math.max(...peaks), 2),
    truePeakDbtp,
  };
}