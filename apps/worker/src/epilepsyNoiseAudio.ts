import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EPILEPSY_NOISE_SAMPLE_RATE_HZ = 48_000;
export const EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP = -2;
export const EPILEPSY_NOISE_INITIAL_LIMIT_DBFS = -3;
export const EPILEPSY_NOISE_MAX_ENCODE_ATTEMPTS = 3;
const TRUE_PEAK_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const RETRY_SAFETY_MARGIN_DB = 0.5;

function round(value: number, places = 2): number {
  return Number(value.toFixed(places));
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function buildEpilepsyNoiseAudioFilters(finalLimitDbfs: number): string[] {
  return [
    'highpass=f=80',
    'lowpass=f=12000',
    'acompressor=threshold=0.125:ratio=4:attack=5:release=150:makeup=1.5',
    'dynaudnorm=f=150:g=9:p=0.7:m=4:r=0.3',
    'loudnorm=I=-18:LRA=7:TP=-3',
    `alimiter=limit=${dbToLinear(finalLimitDbfs).toFixed(6)}:attack=5:release=50:level=false`,
    `aresample=${EPILEPSY_NOISE_SAMPLE_RATE_HZ}`,
  ];
}

export function nextEpilepsyNoiseLimitDbfs(
  currentLimitDbfs: number,
  measuredTruePeakDbtp: number,
): number {
  const overshootDb = measuredTruePeakDbtp - EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP;
  return round(currentLimitDbfs - overshootDb - RETRY_SAFETY_MARGIN_DB);
}

export async function encodeEpilepsyNoiseWithTruePeakGate(options: {
  encode: (filters: string[], attempt: number) => Promise<void>;
  measureTruePeakDbtp: () => Promise<number>;
  onRetry?: (details: {
    attempt: number;
    encodedTruePeakDbtp: number;
    ceilingDbtp: number;
    nextLimitDbfs: number;
  }) => void;
}): Promise<{ encodedTruePeakDbtp: number; encodeAttempts: number }> {
  let finalLimitDbfs = EPILEPSY_NOISE_INITIAL_LIMIT_DBFS;
  let encodedTruePeakDbtp = Number.POSITIVE_INFINITY;

  for (let attempt = 1; attempt <= EPILEPSY_NOISE_MAX_ENCODE_ATTEMPTS; attempt += 1) {
    await options.encode(buildEpilepsyNoiseAudioFilters(finalLimitDbfs), attempt);
    encodedTruePeakDbtp = await options.measureTruePeakDbtp();
    if (encodedTruePeakDbtp <= EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP) {
      return { encodedTruePeakDbtp, encodeAttempts: attempt };
    }
    if (attempt < EPILEPSY_NOISE_MAX_ENCODE_ATTEMPTS) {
      finalLimitDbfs = nextEpilepsyNoiseLimitDbfs(finalLimitDbfs, encodedTruePeakDbtp);
      options.onRetry?.({
        attempt,
        encodedTruePeakDbtp,
        ceilingDbtp: EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP,
        nextLimitDbfs: finalLimitDbfs,
      });
    }
  }

  throw new Error(`epilepsy_noise_encoded_true_peak_exceeded:${encodedTruePeakDbtp}dbtp`);
}

export async function measureEncodedTruePeakDbtp(inputPath: string): Promise<number> {
  const { stdout, stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-nostats',
    '-i', inputPath,
    '-map', '0:a:0',
    '-af', 'loudnorm=I=-18:LRA=7:TP=-2:print_format=json',
    '-f', 'null', '-',
  ], {
    timeout: TRUE_PEAK_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const output = `${stdout}\n${stderr}`;
  const matches = [...output.matchAll(/"input_tp"\s*:\s*"(-?(?:\d+(?:\.\d+)?|inf))"/g)];
  const raw = matches.at(-1)?.[1];
  const truePeak = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(truePeak)) {
    throw new Error('encoded_true_peak_measurement_missing');
  }
  return round(truePeak);
}
