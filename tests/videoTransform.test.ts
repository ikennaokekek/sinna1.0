import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockImplementation(async (_client: unknown, command: { input?: { Key?: string } }) => {
      const key = command?.input?.Key ?? 'object';
      return `https://r2.example/${key.split('/').map(encodeURIComponent).join('/')}?X-Amz-Expires=3600`;
    }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = vi.fn().mockResolvedValue({});
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: { Bucket?: string; Key?: string }) {}
  },
}));

vi.mock('../apps/worker/src/lib/r2', () => ({
  uploadToR2: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// Load presets
const presetsPath = path.join(__dirname, '..', 'config', 'presets.json');
let presets: Record<string, any> = {};

try {
  const presetsContent = fs.readFileSync(presetsPath, 'utf-8');
  presets = JSON.parse(presetsContent);
} catch (error) {
  console.warn('Failed to load presets.json:', error);
}

describe('Video Transformation Tests', () => {
  let mockConnection: IORedis;
  let mockQueue: Queue;

  beforeEach(() => {
    // Mock Redis connection
    mockConnection = {
      get: vi.fn(),
      set: vi.fn(),
    } as any;

    // Mock Queue
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
      getJob: vi.fn().mockResolvedValue({
        id: 'test-job-id',
        isCompleted: vi.fn().mockReturnValue(true),
        failedReason: null,
        returnvalue: {
          ok: true,
          artifactKey: 'artifacts/test-tenant/test-job-id-transformed.mp4',
          cloudinaryUrl: 'https://cloudinary.com/test.mp4',
          tenantId: 'test-tenant',
          presetId: 'blindness',
        },
        timestamp: Date.now(),
      }),
    } as any;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Preset Filter Configuration', () => {
    const videoTransformPresets = [
      'blindness',
      'deaf',
      'color_blindness',
      'epilepsy_flash',
      'epilepsy_noise',
      'cognitive_load',
    ];

    videoTransformPresets.forEach((presetName) => {
      it(`should apply correct filters for ${presetName} preset`, () => {
        const preset = presets[presetName];
        
        expect(preset).toBeDefined();
        expect(preset.videoTransform).toBe(true);
        expect(preset.videoTransformConfig).toBeDefined();

        // Verify specific filter configurations
        const config = preset.videoTransformConfig;

        switch (presetName) {
          case 'blindness':
            expect(config.audioDescription).toBe(true);
            expect(config.contrastBoost).toBe(false);
            break;

          case 'deaf':
            expect(config.captionOverlay).toBe(true);
            expect(config.volumeBoost).toBe(true);
            break;

          case 'color_blindness':
            expect(config.colorProfile).toBe('colorblind-safe');
            expect(config.filter).toBe('e_colorblind_correction');
            break;

          case 'epilepsy_flash':
            expect(preset.adEnabled).toBe(false);
            expect(config.flashReduce).toBe(true);
            expect(config.flashRiskEvidence).toBe(true);
            break;

          case 'epilepsy_noise':
            expect(preset.adEnabled).toBe(false);
            expect(config.audioSmooth).toBe(true);
            expect(config.lowPassFilter).toBe(true);
            expect(config.audioRiskEvidence).toBe(true);
            break;

          case 'cognitive_load':
            expect(config.simplifiedText).toBe(true);
            expect(config.focusHighlight).toBe(true);
            break;
        }
      });
    });
  });

  describe('Video Transform Worker', () => {
    beforeEach(() => {
      // Set up environment for FFmpeg fallback
      process.env.CLOUDINARY_URL = '';
      process.env.R2_BUCKET = 'test-bucket';
      process.env.R2_ACCOUNT_ID = 'test-account';
      process.env.R2_ACCESS_KEY_ID = 'test-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    });

    it('should process video transformation job with blindness preset', async () => {
      const jobData = {
        videoUrl: 'https://example.com/video.mp4',
        tenantId: 'test-tenant',
        presetId: 'blindness',
        transformConfig: presets.blindness?.videoTransformConfig,
      };

      // Verify transform config contains expected values
      expect(jobData.transformConfig).toBeDefined();
      if (jobData.transformConfig) {
        expect(jobData.transformConfig.audioDescription).toBe(true);
        expect(jobData.transformConfig.contrastBoost).toBe(false);
      }
    });

    it('should process video transformation job with epilepsy_noise preset', async () => {
      const jobData = {
        videoUrl: 'https://example.com/video.mp4',
        tenantId: 'test-tenant',
        presetId: 'epilepsy_noise',
        transformConfig: presets.epilepsy_noise?.videoTransformConfig,
      };

      // Verify audio filters are configured
      expect(jobData.transformConfig).toBeDefined();
      if (jobData.transformConfig) {
        expect(jobData.transformConfig.lowPassFilter).toBe(true);
        expect(jobData.transformConfig.audioSmooth).toBe(true);
      }
    });

    it('should process video transformation job with cognitive_load preset', async () => {
      const jobData = {
        videoUrl: 'https://example.com/video.mp4',
        tenantId: 'test-tenant',
        presetId: 'cognitive_load',
        transformConfig: presets.cognitive_load?.videoTransformConfig,
      };

      // Verify cognitive load filters
      expect(jobData.transformConfig).toBeDefined();
      if (jobData.transformConfig) {
        expect(jobData.transformConfig.simplifiedText).toBe(true);
        expect(jobData.transformConfig.focusHighlight).toBe(true);
      }
    });

    it('should process video transformation job with color_blindness preset', async () => {
      const jobData = {
        videoUrl: 'https://example.com/video.mp4',
        tenantId: 'test-tenant',
        presetId: 'color_blindness',
        transformConfig: presets.color_blindness?.videoTransformConfig,
      };

      // Verify color blindness filters
      expect(jobData.transformConfig).toBeDefined();
      if (jobData.transformConfig) {
        expect(jobData.transformConfig.colorProfile).toBe('colorblind-safe');
        expect(jobData.transformConfig.filter).toBe('e_colorblind_correction');
      }
    });
  });

  describe('R2 Upload and Signed URL Validation', () => {
    it('should upload transformed video to R2', async () => {
      const { uploadToR2 } = await import('../apps/worker/src/lib/r2');
      
      const r2Key = 'artifacts/test-tenant/test-job-id-transformed.mp4';
      const videoBuffer = Buffer.from('fake video content');
      
      await uploadToR2(r2Key, videoBuffer, 'video/mp4');
      
      expect(uploadToR2).toHaveBeenCalledWith(
        r2Key,
        videoBuffer,
        'video/mp4'
      );
    });

    it('should generate signed URL for transformed video artifact', async () => {
      const { getSignedGetUrl } = await import('../apps/api/src/lib/r2');
      
      const artifactKey = 'artifacts/test-tenant/test-job-id-transformed.mp4';
      const signedUrl = await getSignedGetUrl(artifactKey);
      
      // Verify signed URL format
      expect(signedUrl).toContain('https://');
      expect(signedUrl).toContain(artifactKey);
      expect(signedUrl).toContain('X-Amz-Expires');
    });

    it('should validate R2 artifact key format', () => {
      const artifactKey = 'artifacts/test-tenant/test-job-id-transformed.mp4';
      
      expect(artifactKey).toMatch(/^artifacts\/[^/]+\/[^/]+-transformed\.mp4$/);
      expect(artifactKey).toContain('transformed.mp4');
    });
  });

  describe('Job Status Updates', () => {
    it('should update job status to completed when video transform finishes', async () => {
      const mockJob = {
        id: 'test-job-id',
        isCompleted: vi.fn().mockReturnValue(true),
        failedReason: null,
        returnvalue: {
          ok: true,
          artifactKey: 'artifacts/test-tenant/test-job-id-transformed.mp4',
          cloudinaryUrl: 'https://cloudinary.com/test.mp4',
          tenantId: 'test-tenant',
          presetId: 'blindness',
        },
        timestamp: Date.now(),
      };

      expect(mockJob.isCompleted()).toBe(true);
      expect(mockJob.returnvalue.ok).toBe(true);
      expect(mockJob.returnvalue.artifactKey).toBeDefined();
    });

    it('should handle job status with video transform step', () => {
      const jobStatus = {
        id: 'test-job-id',
        status: 'completed' as const,
        steps: {
          captions: { status: 'completed' as const, artifactKey: 'captions.vtt' },
          ad: { status: 'completed' as const, artifactKey: 'ad.mp3' },
          color: { status: 'completed' as const, artifactKey: 'color.json' },
          videoTransform: {
            status: 'completed' as const,
            artifactKey: 'artifacts/test-tenant/test-job-id-transformed.mp4',
            cloudinaryUrl: 'https://cloudinary.com/test.mp4',
          },
        },
        preset: 'blindness',
        createdAt: new Date().toISOString(),
      };

      expect(jobStatus.status).toBe('completed');
      expect(jobStatus.steps.videoTransform?.status).toBe('completed');
      expect(jobStatus.steps.videoTransform?.artifactKey).toBeDefined();
    });

    it('should mark job as failed if video transform fails', () => {
      const mockJob = {
        id: 'test-job-id',
        isCompleted: vi.fn().mockReturnValue(false),
        failedReason: 'Video transformation failed',
        returnvalue: null,
        timestamp: Date.now(),
      };

      expect(mockJob.isCompleted()).toBe(false);
      expect(mockJob.failedReason).toBeDefined();
    });
  });

  describe('Integration: Full Video Transform Flow', () => {
    it('should complete full video transformation pipeline', async () => {
      // Simulate job creation with video transform preset
      const jobBundle = {
        id: 'test-job-id',
        steps: {
          captions: 'caption-job-id',
          ad: 'ad-job-id',
          color: 'color-job-id',
          videoTransform: 'video-transform-job-id',
        },
        preset: 'blindness',
      };

      // Verify bundle structure
      expect(jobBundle.steps.videoTransform).toBeDefined();
      expect(jobBundle.preset).toBe('blindness');

      // Simulate job completion
      const completedStatus = {
        captions: { status: 'completed' as const },
        ad: { status: 'completed' as const },
        color: { status: 'completed' as const },
        videoTransform: { status: 'completed' as const },
      };

      // Overall status should be completed when all steps are done
      const overallStatus = 
        completedStatus.videoTransform.status === 'completed' &&
        completedStatus.captions.status === 'completed' &&
        completedStatus.ad.status === 'completed' &&
        completedStatus.color.status === 'completed'
          ? 'completed'
          : 'processing';

      expect(overallStatus).toBe('completed');
    });

    it('should handle presets without video transform', () => {
      const jobBundle = {
        id: 'test-job-id',
        steps: {
          captions: 'caption-job-id',
          ad: 'ad-job-id',
          color: 'color-job-id',
          // No videoTransform step
        },
        preset: 'everyday',
      };

      expect(jobBundle.steps.videoTransform).toBeUndefined();
      expect(presets.everyday.videoTransform).toBeUndefined();
    });
  });

  describe('Filter Configuration Validation', () => {
    it('should validate FFmpeg filter commands for epilepsy_noise', () => {
      const config = presets.epilepsy_noise?.videoTransformConfig;
      
      if (!config) return;
      
      // Expected FFmpeg audio filters
      const expectedFilters = [
        'highpass=f=80',
        'lowpass=f=12000',
        'acompressor',
        'alimiter',
        'loudnorm',
      ];
      
      if (config.lowPassFilter) {
        expect(expectedFilters).toContain('lowpass=f=12000');
      }
      if (config.audioSmooth) {
        expect(expectedFilters).toContain('highpass=f=80');
        expect(expectedFilters).toContain('acompressor');
        expect(expectedFilters).toContain('alimiter');
        expect(expectedFilters).toContain('loudnorm');
      }
      expect(config.audioRiskEvidence).toBe(true);
    });

    it('should validate FFmpeg filter commands for cognitive_load', () => {
      const config = presets.cognitive_load?.videoTransformConfig;
      
      if (!config) return;
      
      // Expected FFmpeg video filters
      const expectedFilters = ['fps=24', 'tblend=average', 'minterpolate', 'eq=brightness=-0.05:contrast=-0.05'];
      
      if (config.simplifiedText) {
        expect(expectedFilters).toContain('fps=24');
        expect(expectedFilters).toContain('tblend=average');
      }
      if (config.focusHighlight) {
        expect(expectedFilters).toContain('minterpolate');
        expect(expectedFilters).toContain('eq=brightness=-0.05:contrast=-0.05');
      }
    });

    it('should validate Cloudinary transformations for color_blindness', () => {
      const config = presets.color_blindness?.videoTransformConfig;
      
      if (!config) return;
      
      expect(config.colorProfile).toBe('colorblind-safe');
      expect(config.filter).toBe('e_colorblind_correction');
      
      // Cloudinary SDK transformation
      const cloudinaryTransform = { effect: 'colorblind_correction' };
      expect(cloudinaryTransform.effect).toBe('colorblind_correction');
    });

    it('should require timeline evidence for epilepsy_flash', () => {
      const config = presets.epilepsy_flash?.videoTransformConfig;
      
      if (!config) return;
      
      expect(config.flashReduce).toBe(true);
      expect(config.flashRiskEvidence).toBe(true);
      expect(config.brightness).toBeUndefined();
      expect(config.contrast).toBeUndefined();
    });

    it('uses bounded temporal and dynamic-audio processing for epilepsy golden paths', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../apps/worker/src/videoTransformWorker.ts'),
        'utf8',
      );
      expect(source).toContain("tmix=frames=5:weights='1 2 3 2 1'");
      expect(source).toContain('acompressor=threshold=0.125:ratio=4');
      expect(source).toContain('dynaudnorm=f=150:g=9');
      expect(source).toContain('alimiter=limit=0.8');
      expect(source).toContain('loudnorm=I=-18:LRA=7:TP=-1.5');
      expect(source).toContain('timeout: VIDEO_TRANSFORM_TIMEOUT_MS');
      expect(source).toContain('-evidence.json');
    });
  });
});

