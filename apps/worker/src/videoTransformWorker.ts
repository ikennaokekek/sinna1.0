import { Worker } from 'bullmq';
import { uploadToR2, downloadFromR2 } from './lib/r2';
import IORedis from 'ioredis';
import { exec } from 'child_process';
import util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { downloadExternalMedia, safeExternalFetch } from './lib/ssrf';
import {
  AudioDynamicsMetrics,
  FlashRiskMetrics,
  measureAudioDynamics,
  measureFlashRisk,
} from './epilepsyEvidence';
import {
  buildEpilepsyNoiseAudioFilters,
  encodeEpilepsyNoiseWithTruePeakGate,
  EPILEPSY_NOISE_INITIAL_LIMIT_DBFS,
  EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP,
  measureEncodedTruePeakDbtp,
} from './epilepsyNoiseAudio';

const execAsync = util.promisify(exec);
const VIDEO_TRANSFORM_TIMEOUT_MS = 120_000;

type TransformEvidence =
  | {
      kind: 'flash-risk-proxy';
      before: FlashRiskMetrics;
      after: FlashRiskMetrics;
      improvement: {
        maxLuminanceDeltaReduction: number;
        rapidHighDeltaTransitionReduction: number;
      };
      disclaimer: string;
    }
  | {
      kind: 'audio-dynamics';
      before: AudioDynamicsMetrics;
      after: AudioDynamicsMetrics;
      improvement: {
        shortWindowRmsRangeReductionDb: number;
        peakReductionDb: number;
      };
      encodedTruePeakCeilingDbtp: number;
      encodedTruePeakDbtp: number;
      encodeAttempts: number;
      disclaimer: string;
    };

interface VideoTransformJobData {
  videoUrl: string;
  tenantId: string;
  presetId: string;
  transformConfig?: {
    colorProfile?: string;
    filter?: string;
    motionReduce?: boolean;
    strobeReduce?: boolean;
    colorSoftening?: boolean;
    saturation?: number;
    speed?: number;
    captionOverlay?: boolean;
    volumeBoost?: boolean;
    audioDescription?: boolean;
    contrastBoost?: boolean;
    flashReduce?: boolean;
    brightness?: number;
    contrast?: number;
    audioSmooth?: boolean;
    lowPassFilter?: boolean;
    simplifiedText?: boolean;
    focusHighlight?: boolean;
    flashRiskEvidence?: boolean;
    audioRiskEvidence?: boolean;
  };
  adJobId?: string | number; // For accessing audio description artifact
  captionJobId?: string | number; // For accessing caption artifact
}

/**
 * Transform video using Cloudinary SDK
 */
async function transformWithCloudinary(
  video: Buffer,
  transformConfig: VideoTransformJobData['transformConfig']
): Promise<string> {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) {
    throw new Error('CLOUDINARY_URL not configured');
  }

  // Extract credentials from CLOUDINARY_URL: cloudinary://api_key:api_secret@cloud_name
  const match = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([\w-]+)@([\w-]+)/);
  if (!match) {
    throw new Error('Invalid CLOUDINARY_URL format');
  }

  const [, apiKey, apiSecret, cloudName] = match;

  // Use Cloudinary SDK if available, otherwise use REST API
  try {
    // Try to use Cloudinary SDK
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const transformations: any[] = [];

    // Motion reduction
    if (transformConfig?.motionReduce) {
      transformations.push({ fps: 24 });
    }

    // Strobe/flash reduction
    if (transformConfig?.strobeReduce || transformConfig?.flashReduce) {
      transformations.push({ effect: 'brightness:-20' });
      transformations.push({ effect: 'contrast:-10' });
    }

    // Color softening
    if (transformConfig?.colorSoftening) {
      transformations.push({ effect: 'saturation:-20' });
    }

    // Saturation adjustment
    if (transformConfig?.saturation !== undefined) {
      const satValue = Math.round(transformConfig.saturation * 100);
      transformations.push({ effect: `saturation:${satValue}` });
    }

    // Brightness adjustment
    if (transformConfig?.brightness !== undefined) {
      const brightnessValue = Math.round(transformConfig.brightness * 100);
      transformations.push({ effect: `brightness:${brightnessValue}` });
    }

    // Contrast adjustment
    if (transformConfig?.contrast !== undefined) {
      const contrastValue = Math.round(transformConfig.contrast * 100);
      transformations.push({ effect: `contrast:${contrastValue}` });
    }

    // Speed adjustment (if different from 1.0)
    if (transformConfig?.speed && transformConfig.speed !== 1.0) {
      const speedPercent = Math.round(transformConfig.speed * 100);
      transformations.push({ effect: `speed:${speedPercent}` });
    }

    // Audio smoothing for noise-triggered epilepsy
    if (transformConfig?.audioSmooth) {
      // Cloudinary doesn't have direct audio smoothing, so we'll use a combination
      // of effects that reduce audio sharpness
      transformations.push({ audio_codec: 'aac', audio_frequency: 44100 });
    }

    // Low-pass audio filter for noise-triggered epilepsy
    if (transformConfig?.lowPassFilter) {
      // Cloudinary doesn't support audio filters directly, but we can note it
      // Actual audio filtering would need to be done via FFmpeg
      console.log('⚠️ Low-pass filter requested - will apply in FFmpeg fallback if Cloudinary unavailable');
    }

    // Flash scene removal for cognitive load (reduce brightness variations)
    if (transformConfig?.focusHighlight) {
      // Smooth out brightness variations
      transformations.push({ effect: 'brightness:-5' });
      transformations.push({ effect: 'contrast:-5' });
    }

    // Slow transitions for cognitive load (reduce speed)
    if (transformConfig?.simplifiedText) {
      // This is more about caption/text simplification, but we can slow down
      // video transitions by reducing frame rate and smoothing
      if (!transformConfig.motionReduce) {
        transformations.push({ fps: 24 });
      }
    }

    // Default quality and format
    transformations.push({ quality: 'auto' });
    transformations.push({ format: 'mp4' });

    console.log('📤 Uploading video to Cloudinary with transformations:', JSON.stringify(transformations));

    const result: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: 'video',
        folder: 'sinna/transformed',
        transformation: transformations,
      }, (error: Error | undefined, uploadResult: any) => error ? reject(error) : resolve(uploadResult));
      stream.end(video);
    });

    if (!result.secure_url) {
      throw new Error('Cloudinary did not return transformed video URL');
    }

    console.log('✅ Video transformed successfully via Cloudinary SDK:', result.secure_url);
    return result.secure_url;
  } catch (sdkError: any) {
    // Fallback to REST API if SDK import fails
    console.warn('Cloudinary SDK not available, using REST API:', sdkError.message);
    return transformWithCloudinaryRest(video, transformConfig, apiKey, apiSecret, cloudName);
  }
}

/**
 * Fallback: Transform video using Cloudinary REST API
 */
async function transformWithCloudinaryRest(
  video: Buffer,
  transformConfig: VideoTransformJobData['transformConfig'],
  apiKey: string,
  apiSecret: string,
  cloudName: string
): Promise<string> {
  const transformations: string[] = [];

  // Motion reduction
  if (transformConfig?.motionReduce) {
    transformations.push('fps_24');
  }

  // Strobe/flash reduction
  if (transformConfig?.strobeReduce || transformConfig?.flashReduce) {
    transformations.push('e_brightness:-20');
    transformations.push('e_contrast:-10');
  }

  // Color softening
  if (transformConfig?.colorSoftening) {
    transformations.push('e_saturation:-20');
  }

  // Saturation adjustment
  if (transformConfig?.saturation !== undefined) {
    const satValue = Math.round(transformConfig.saturation * 100);
    transformations.push(`e_saturation:${satValue}`);
  }

  // Brightness adjustment
  if (transformConfig?.brightness !== undefined) {
    const brightnessValue = Math.round(transformConfig.brightness * 100);
    transformations.push(`e_brightness:${brightnessValue}`);
  }

  // Contrast adjustment
  if (transformConfig?.contrast !== undefined) {
    const contrastValue = Math.round(transformConfig.contrast * 100);
    transformations.push(`e_contrast:${contrastValue}`);
  }

    // Speed adjustment (if different from 1.0)
    if (transformConfig?.speed && transformConfig.speed !== 1.0) {
      const speedPercent = Math.round(transformConfig.speed * 100);
      transformations.push(`e_speed:${speedPercent}`);
    }

    // Audio smoothing for noise-triggered epilepsy (REST API doesn't support audio filters well)
    // Will be handled in FFmpeg fallback
    if (transformConfig?.audioSmooth || transformConfig?.lowPassFilter) {
      console.log('⚠️ Audio filtering requested - will apply in FFmpeg fallback');
    }

    // Flash scene removal for cognitive load (reduce brightness variations)
    if (transformConfig?.focusHighlight) {
      transformations.push('e_brightness:-5');
      transformations.push('e_contrast:-5');
    }

    // Slow transitions for cognitive load
    if (transformConfig?.simplifiedText) {
      // Reduce frame rate to slow transitions
      if (!transformConfig.motionReduce) {
        transformations.push('fps_24');
      }
    }

    // Default quality and format
    transformations.push('q_auto');
    transformations.push('f_mp4');

  const transformString = transformations.join('/');

  // Upload video to Cloudinary and apply transformations
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const crypto = await import('crypto');
  
  const formData = new URLSearchParams();
  // A data URI keeps Cloudinary from resolving the user-provided URL itself.
  formData.append('file', `data:video/mp4;base64,${video.toString('base64')}`);
  formData.append('resource_type', 'video');
  formData.append('transformation', transformString);
  formData.append('api_key', apiKey);
  formData.append('timestamp', Math.floor(Date.now() / 1000).toString());

  // Generate signature for upload
  const signatureString = formData.toString();
  const signature = crypto.createHash('sha1').update(signatureString + apiSecret).digest('hex');
  formData.append('signature', signature);

  console.log('📤 Uploading video to Cloudinary with transformations:', transformString);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(`Cloudinary upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  const uploadData = await uploadResponse.json();
  const transformedVideoUrl = uploadData.secure_url;

  if (!transformedVideoUrl) {
    throw new Error('Cloudinary did not return transformed video URL');
  }

  console.log('✅ Video transformed successfully via Cloudinary REST API:', transformedVideoUrl);
  return transformedVideoUrl;
}

/**
 * Transform video using FFmpeg (fallback when Cloudinary not available)
 */
async function transformWithFFmpeg(
  inputUrl: string,
  transformConfig: VideoTransformJobData['transformConfig'],
  adJobId?: string | number,
  captionJobId?: string | number,
  tenantId?: string
): Promise<{ videoBuffer: Buffer; evidence?: TransformEvidence }> {
  console.log('🔄 Using FFmpeg fallback for video transformation');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sinna-transform-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPath = path.join(tempDir, 'output.mp4');
  const adPath = adJobId ? path.join(tempDir, 'audio-description.mp3') : null;
  const captionPath = captionJobId ? path.join(tempDir, 'captions.vtt') : null;

  try {
    // Download video
    const { body: videoBuffer } = await downloadExternalMedia(inputUrl);
    fs.writeFileSync(inputPath, videoBuffer);
    const flashBefore = transformConfig?.flashRiskEvidence
      ? await measureFlashRisk(inputPath)
      : undefined;
    const audioBefore = transformConfig?.audioRiskEvidence
      ? await measureAudioDynamics(inputPath)
      : undefined;

    // Download audio description if needed for blindness preset
    if (transformConfig?.audioDescription && adJobId && tenantId) {
      const adKey = `artifacts/${tenantId}/${adJobId}.mp3`;
      const adBuffer = await downloadFromR2(adKey);
      if (adPath) {
        fs.writeFileSync(adPath, adBuffer);
        console.log('✅ Downloaded audio description for mixing');
      }
    }

    // Download captions if needed for deaf preset (caption overlay)
    if (transformConfig?.captionOverlay && captionJobId && tenantId) {
      const captionKey = `artifacts/${tenantId}/${captionJobId}.vtt`;
      const captionBuffer = await downloadFromR2(captionKey);
      if (captionPath) {
        fs.writeFileSync(captionPath, captionBuffer);
        console.log('✅ Downloaded captions for overlay');
      }
    }

    // Build FFmpeg filters
    const filters: string[] = [];

    // Caption overlay (for deaf preset - burn captions into video)
    if (transformConfig?.captionOverlay && captionPath && fs.existsSync(captionPath)) {
      // Use subtitles filter to burn captions into video
      filters.push(`subtitles=${captionPath.replace(/\\/g, '/')}:force_style='FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=1'`);
    }

    // Flash reduction
    if (transformConfig?.flashReduce || transformConfig?.strobeReduce) {
      filters.push('fps=24');
      filters.push("tmix=frames=5:weights='1 2 3 2 1'");
      filters.push('eq=contrast=0.85:saturation=0.9');
    }

    // Color blindness correction. This matrix is handled by FFmpeg because
    // Cloudinary's former colorblind_correction effect is not valid for video.
    if (transformConfig?.colorProfile === 'colorblind-safe') {
      filters.push(
        'colorchannelmixer=rr=0.8:rg=0.2:gr=0.258:gg=0.742:br=0:bg=0.142:bb=0.858',
      );
    }

    // Motion reduction
    if (transformConfig?.motionReduce) {
      filters.push('tblend=average');
      filters.push('framestep=2');
    }

    // Brightness adjustment
    if (transformConfig?.brightness !== undefined) {
      filters.push(`eq=brightness=${transformConfig.brightness}`);
    }

    // Contrast adjustment
    if (transformConfig?.contrast !== undefined) {
      filters.push(`eq=contrast=${transformConfig.contrast}`);
    }

    // Color softening (for autism - muted colors)
    if (transformConfig?.colorSoftening) {
      if (!transformConfig.saturation) {
        filters.push('eq=saturation=0.7');
      }
    }

    // Saturation adjustment (can override colorSoftening if specified)
    if (transformConfig?.saturation !== undefined) {
      filters.push(`eq=saturation=${transformConfig.saturation}`);
    }

    // Speed adjustment
    if (transformConfig?.speed && transformConfig.speed !== 1.0) {
      filters.push(`setpts=${1 / transformConfig.speed}*PTS`);
    }

    // Flash scene removal for cognitive load
    if (transformConfig?.focusHighlight) {
      // Use minterpolate to smooth out flash scenes
      if (!filters.some(f => f.includes('minterpolate'))) {
        filters.push('minterpolate');
      }
      filters.push('eq=brightness=-0.05:contrast=-0.05');
    }

    // Slow transitions for cognitive load
    if (transformConfig?.simplifiedText) {
      // Reduce frame rate to slow transitions
      if (!filters.some(f => f.startsWith('fps='))) {
        filters.push('fps=24');
      }
      // Add temporal smoothing
      filters.push('tblend=average');
    }

    // Build FFmpeg command
    const filterString = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    
    // Build audio filter chain
    const audioFilterChain: string[] = [];
    
    // Volume boost (for deaf preset)
    if (transformConfig?.volumeBoost) {
      audioFilterChain.push('volume=1.5'); // Boost volume by 50%
    }
    
    // Audio description mixing (for blindness preset - mix AD audio into video)
    let audioInputs = '';
    if (transformConfig?.audioDescription && adPath && fs.existsSync(adPath)) {
      // Mix original audio with audio description
      audioInputs = `-i "${adPath}" `;
      audioFilterChain.push('[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2');
    }
    
    // Low-pass audio filter for noise-triggered epilepsy
    if (transformConfig?.lowPassFilter) {
      audioFilterChain.push('highpass=f=80');
      audioFilterChain.push('lowpass=f=12000');
    }
    
    const isEpilepsyNoiseAudio = Boolean(
      transformConfig?.audioRiskEvidence
      && transformConfig?.audioSmooth
      && transformConfig?.lowPassFilter,
    );

    // Audio smoothing for noise-triggered epilepsy
    if (transformConfig?.audioSmooth) {
      if (isEpilepsyNoiseAudio) {
        audioFilterChain.splice(0, audioFilterChain.length);
        audioFilterChain.push(...buildEpilepsyNoiseAudioFilters(EPILEPSY_NOISE_INITIAL_LIMIT_DBFS));
      } else {
        if (!audioFilterChain.includes('highpass=f=80')) {
          audioFilterChain.push('highpass=f=80');
        }
        if (!audioFilterChain.includes('lowpass=f=12000')) {
          audioFilterChain.push('lowpass=f=12000');
        }
        audioFilterChain.push('acompressor=threshold=0.125:ratio=4:attack=5:release=150:makeup=1.5');
        audioFilterChain.push('dynaudnorm=f=150:g=9:p=0.7:m=4:r=0.3');
        audioFilterChain.push('alimiter=limit=0.8:attack=5:release=50');
        audioFilterChain.push('loudnorm=I=-18:LRA=7:TP=-1.5');
      }
    }
    
    // Speed adjustment (audio tempo)
    if (transformConfig?.speed && transformConfig.speed !== 1.0) {
      audioFilterChain.push(`atempo=${transformConfig.speed}`);
    }
    
    // Build final audio filter
    let encodedTruePeakDbtp: number | undefined;
    let encodeAttempts = 1;
    const encode = async (attemptAudioFilters: string[]): Promise<void> => {
      const finalAudioFilter = attemptAudioFilters.length > 0
        ? `-af "${attemptAudioFilters.join(',')}"`
        : '-c:a copy';
      const outputAudioRate = isEpilepsyNoiseAudio ? '-ar 48000' : '';
      const cmd = `ffmpeg -y -i "${inputPath}" ${audioInputs}${filterString} ${finalAudioFilter} ${outputAudioRate} "${outputPath}"`;

      console.log('🔧 Running FFmpeg command:', cmd);
      await execAsync(cmd, {
        timeout: VIDEO_TRANSFORM_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        maxBuffer: 8 * 1024 * 1024,
      });
    };
    if (isEpilepsyNoiseAudio) {
      const verified = await encodeEpilepsyNoiseWithTruePeakGate({
        encode,
        measureTruePeakDbtp: () => measureEncodedTruePeakDbtp(outputPath),
        onRetry: (details) => {
          console.warn('Encoded epilepsy_noise output exceeded true-peak ceiling; retrying safely', details);
        },
      });
      encodedTruePeakDbtp = verified.encodedTruePeakDbtp;
      encodeAttempts = verified.encodeAttempts;
    } else {
      await encode(audioFilterChain);
    }

    // Read transformed video
    const transformedBuffer = fs.readFileSync(outputPath);
    let evidence: TransformEvidence | undefined;
    if (flashBefore) {
      const after = await measureFlashRisk(outputPath);
      evidence = {
        kind: 'flash-risk-proxy',
        before: flashBefore,
        after,
        improvement: {
          maxLuminanceDeltaReduction: Number(
            (flashBefore.maxLuminanceDelta - after.maxLuminanceDelta).toFixed(4),
          ),
          rapidHighDeltaTransitionReduction:
            flashBefore.rapidHighDeltaTransitions - after.rapidHighDeltaTransitions,
        },
        disclaimer: 'Engineering luminance-transition proxy only; not medical certification or guaranteed seizure prevention.',
      };
    } else if (audioBefore) {
      const after = await measureAudioDynamics(outputPath);
      evidence = {
        kind: 'audio-dynamics',
        before: audioBefore,
        after,
        improvement: {
          shortWindowRmsRangeReductionDb: Number(
            (audioBefore.shortWindowRmsRangeDb - after.shortWindowRmsRangeDb).toFixed(2),
          ),
          peakReductionDb: Number(
            (audioBefore.maxPeakDbfs - after.maxPeakDbfs).toFixed(2),
          ),
        },
        encodedTruePeakCeilingDbtp: EPILEPSY_NOISE_TRUE_PEAK_CEILING_DBTP,
        encodedTruePeakDbtp: encodedTruePeakDbtp!,
        encodeAttempts,
        disclaimer: 'Engineering audio-dynamics measurements only; not medical certification or guaranteed trigger prevention.',
      };
    }

    return { videoBuffer: transformedBuffer, evidence };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Failed to cleanup transform temp directory:', cleanupError);
    }
  }
}

export function createVideoTransformWorker(
  connection: IORedis,
  prefix: string,
  concurrency: number,
  recordCompletion: (completion: { queueName: string; jobId: string; tenantId: string; egressBytes: number }) => Promise<void>,
): Worker {
  return new Worker(
    'video-transform',
    async (job) => {
      console.log('🎬 Video transform job started:', {
        jobId: job.id,
        tenantId: job.data?.tenantId,
        presetId: job.data?.presetId,
      });
      const { videoUrl, tenantId, presetId, transformConfig, adJobId, captionJobId } = job.data as VideoTransformJobData;

      if (!videoUrl) {
        console.error('❌ Missing videoUrl in job data');
        throw new Error('missing_video_url');
      }

      try {
        const cloudinaryUrl = process.env.CLOUDINARY_URL;
        let transformedVideoUrl: string;
        let videoBuffer: Buffer | null = null;
        let evidence: TransformEvidence | undefined;
        const needsAudioProcessing = transformConfig?.lowPassFilter || transformConfig?.audioSmooth;
        const needsAdvancedFeatures = transformConfig?.audioDescription || transformConfig?.captionOverlay || transformConfig?.volumeBoost;
        const needsFfmpegColorCorrection =
          transformConfig?.colorProfile === 'colorblind-safe'
          || transformConfig?.filter === 'e_colorblind_correction';
        const needsEngineeringEvidence =
          transformConfig?.flashRiskEvidence || transformConfig?.audioRiskEvidence;

        // Use FFmpeg if advanced features are needed (audio mixing, caption overlay, volume boost)
        // Cloudinary doesn't support these features well
        if (
          cloudinaryUrl
          && !needsAudioProcessing
          && !needsAdvancedFeatures
          && !needsFfmpegColorCorrection
          && !needsEngineeringEvidence
        ) {
          // Use Cloudinary transformation API (faster, serverless)
          // Note: If audio filtering or advanced features are needed, use FFmpeg fallback for better control
          console.log('☁️ Using Cloudinary for video transformation');
          const { body: sourceVideo } = await downloadExternalMedia(videoUrl);
          transformedVideoUrl = await transformWithCloudinary(sourceVideo, transformConfig);

          // Download transformed video from Cloudinary
          const videoResponse = await safeExternalFetch(transformedVideoUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download transformed video: ${videoResponse.status}`);
          }
          videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        } else {
          // Use FFmpeg for audio filtering, advanced features, or when Cloudinary unavailable
          if (needsFfmpegColorCorrection && cloudinaryUrl) {
            console.log('🔄 Color-blind video correction requires FFmpeg; skipping incompatible Cloudinary effect');
          } else if (needsAdvancedFeatures && cloudinaryUrl) {
            console.log('🔄 Advanced features (audio mixing/caption overlay) required - using FFmpeg for full control');
          } else if (needsAudioProcessing && cloudinaryUrl) {
            console.log('🔄 Audio filtering required - using FFmpeg for full control');
          } else {
            console.log('🔄 Cloudinary not configured, using FFmpeg fallback');
          }
          const transformed = await transformWithFFmpeg(
            videoUrl,
            transformConfig,
            adJobId,
            captionJobId,
            tenantId,
          );
          videoBuffer = transformed.videoBuffer;
          evidence = transformed.evidence;
          // For FFmpeg, we'll use a placeholder URL since it's local processing
          transformedVideoUrl = `ffmpeg-processed-${job.id}`;
        }

        if (!videoBuffer) {
          throw new Error('Failed to get transformed video buffer');
        }

        // Upload transformed video to R2
        const r2Key = `artifacts/${tenantId || 'anon'}/${job.id}-transformed.mp4`;
        await uploadToR2(r2Key, videoBuffer, 'video/mp4');
        let evidenceArtifactKey: string | undefined;
        if (evidence) {
          evidenceArtifactKey = `artifacts/${tenantId || 'anon'}/${job.id}-evidence.json`;
          await uploadToR2(
            evidenceArtifactKey,
            Buffer.from(JSON.stringify(evidence, null, 2)),
            'application/json',
          );
        }
        if (tenantId) {
          await recordCompletion({
            queueName: job.queueName,
            jobId: String(job.id),
            tenantId,
            egressBytes: videoBuffer.length,
          });
        }

        console.log('✅ Transformed video uploaded to R2:', r2Key);

        return {
          ok: true,
          artifactKey: r2Key,
          evidenceArtifactKey,
          evidence,
          cloudinaryUrl: transformedVideoUrl,
          tenantId,
          presetId,
        };
      } catch (error) {
        console.error('Video transformation failed:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    { connection, prefix, concurrency }
  );
}
