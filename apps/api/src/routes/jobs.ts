import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { getSignedGetUrl } from '../lib/r2';
import { getDb } from '../lib/db';
import { incrementAndGateUsage } from '../lib/usage';
import { sendErrorResponse, createError, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, ApiResponse, JobBundle, Artifact, JobStatusResponse, PresetConfig } from '../types';
import { performanceMonitor } from '../lib/logger';
import { redisConnection } from '../lib/redis';
import IORedis from 'ioredis';

interface Queues {
  captions: Queue;
  ad: Queue;
  color: Queue;
  videoTransform: Queue;
}

export function registerJobRoutes(
  app: FastifyInstance,
  queues: Queues,
  redis: IORedis | null,
  queueDepth: { labels: (labels: { queue: string }) => { set: (value: number) => void } },
  failuresTotal: { labels: (labels: { type: string }) => { inc: () => void } }
): void {
  // POST /v1/jobs: validate, idempotency, enqueue pipeline
  app.post('/v1/jobs', {
    schema: {
      description: 'Create a processing job',
      tags: ['Jobs'],
      security: [{ ApiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['source_url'],
        properties: {
          source_url: {
            type: 'string',
            format: 'uri',
            description: 'URL of the video to process'
          },
          preset_id: {
            type: 'string',
            enum: ['everyday', 'adhd', 'autism', 'low_vision', 'color', 'hoh', 'cognitive', 'motion', 'blindness', 'deaf', 'color_blindness', 'epilepsy_flash', 'epilepsy_noise', 'cognitive_load'],
            description: 'Optional preset to influence processing behaviour. Supports video transformation for accessibility needs.'
          }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                steps: {
                  type: 'object',
                  properties: {
                    captions: { type: 'string' },
                    ad: { type: 'string' },
                    color: { type: 'string' },
                    videoTransform: { type: 'string' }
                  }
                },
                preset: { type: 'string' }
              }
            },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            details: { type: 'array' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('create_job', (req as AuthenticatedRequest).requestId);
    
    try {
      const Body = z.object({
        source_url: z.string().url(),
        preset_id: z.string().optional(),
      });
      const body = Body.parse(req.body);
      const tenantId = (req as AuthenticatedRequest).tenantId;
      
      if (!tenantId) {
        return res.code(401).send({ success: false, error: ErrorCodes.UNAUTHORIZED });
      }

      // Usage gate: count one job before enqueue; 429 if exceeding caps
      try {
        const gate = await incrementAndGateUsage(tenantId, { jobs: 1 });
        if (gate.blocked) {
          performanceMonitor.end(perfId);
          return res.code(429).send({ 
            success: false, 
            error: ErrorCodes.RATE_LIMITED, 
            reason: gate.reason 
          });
        }
      } catch (err) {
        req.log.warn({ err }, 'usage gate failed');
      }

      // idempotency key: sha256(source_url+preset+tenant)
      const idemKey = crypto.createHash('sha256')
        .update(`${body.source_url}|${body.preset_id || ''}|${tenantId}`)
        .digest('hex');
      const idemCacheKey = `jobs:idempotency:${idemKey}`;
      
      let existing: string | null = null;
      if (redis) {
        existing = await redis.get(idemCacheKey);
      }
      
      if (existing) {
        performanceMonitor.end(perfId);
        const bundle = JSON.parse(existing) as JobBundle;
        const response: ApiResponse<JobBundle> = {
          success: true,
          data: bundle,
          message: 'Idempotent replay',
        };
        return res.code(200).send(response);
      }

      // derive defaults from preset
      const preset = (body.preset_id || 'everyday').toLowerCase();
      const presetsPath = path.join(__dirname, '..', '..', '..', 'config', 'presets.json');
      let presets: Record<string, PresetConfig> = {};
      try {
        const presetsContent = fs.readFileSync(presetsPath, 'utf-8');
        presets = JSON.parse(presetsContent) as Record<string, PresetConfig>;
      } catch {
        // Use defaults if file doesn't exist
      }
      
      const presetCfg = presets[preset] || presets['everyday'] || { subtitleFormats: ['vtt', 'srt', 'ttml'] };
      const language = 'en';
      const captionFormat = 'vtt';

      // enqueue pipeline: captions -> ad -> color
      const captionJob = await queues.captions.add('generate-subtitles', {
        videoUrl: body.source_url,
        language,
        format: captionFormat,
        formats: presetCfg.subtitleFormats,
        captionStyle: presetCfg.captionStyle,
        burnIn: !!presetCfg.burnIn,
        tenantId,
        userId: tenantId,
      });

      const adJob = await queues.ad.add('generate-audio-description', {
        videoUrl: body.source_url,
        language,
        enabled: !!presetCfg.adEnabled,
        speed: presetCfg.speed || 1.0,
        tenantId,
        userId: tenantId,
        dependsOn: captionJob.id,
      });

      const colorJob = await queues.color.add('analyze-colors', {
        videoUrl: body.source_url,
        colorProfile: presetCfg.colorProfile,
        motionReduce: !!presetCfg.motionReduce,
        strobeReduce: !!presetCfg.strobeReduce,
        tenantId,
        userId: tenantId,
        dependsOn: adJob.id,
      });

      // Add video transformation job if preset requires it
      let videoTransformJobId: string | undefined = undefined;
      if (presetCfg.videoTransform && presetCfg.videoTransformConfig) {
        const videoTransformJob = await queues.videoTransform.add('transform-video', {
          videoUrl: body.source_url,
          tenantId,
          presetId: preset,
          transformConfig: presetCfg.videoTransformConfig,
          // Pass job IDs for accessing artifacts
          adJobId: adJob.id,
          captionJobId: captionJob.id,
        }, {
          // Note: BullMQ doesn't support dependsOn in JobsOptions, jobs run independently
          // Dependencies are handled by checking job status in the worker
        });
        videoTransformJobId = videoTransformJob.id ? String(videoTransformJob.id) : undefined;
      }

      const jobBundle: JobBundle = {
        id: String(captionJob.id!),
        steps: {
          captions: String(captionJob.id!),
          ad: String(adJob.id!),
          color: String(colorJob.id!),
          ...(videoTransformJobId ? { videoTransform: videoTransformJobId } : {}),
        },
        preset,
      };
      
      if (redis) {
        await redis.setex(idemCacheKey, 24 * 3600, JSON.stringify(jobBundle));
      }

      // simple usage counters and cap notices
      try {
        const { pool } = getDb();
        await pool.query(
          `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
           values ($1, date_trunc('month', now())::date, 0, 0, 0)
           on conflict (tenant_id) do nothing`,
          [tenantId]
        );
        await pool.query(
          `update usage_counters
           set jobs = jobs + 1
           where tenant_id = $1`,
          [tenantId]
        );
      } catch (e) {
        req.log.warn({ err: e }, 'Failed to persist usage counters');
      }

      // metrics: update queue depth
      const [cDepth, aDepth, colDepth, vtDepth] = await Promise.all([
        queues.captions.count(),
        queues.ad.count(),
        queues.color.count(),
        queues.videoTransform.count(),
      ]);
      queueDepth.labels({ queue: 'captionsQ' }).set(cDepth);
      queueDepth.labels({ queue: 'adQ' }).set(aDepth);
      queueDepth.labels({ queue: 'colorQ' }).set(colDepth);
      queueDepth.labels({ queue: 'videoTransformQ' }).set(vtDepth);

      performanceMonitor.end(perfId);
      const response: ApiResponse<JobBundle> = {
        success: true,
        data: jobBundle,
        message: 'Pipeline queued',
      };
      return res.code(201).send(response);
    } catch (error) {
      performanceMonitor.end(perfId);
      if (error instanceof z.ZodError) {
        return res.code(400).send({
          success: false,
          error: ErrorCodes.VALIDATION_ERROR,
          details: error.errors,
        });
      }
      req.log.error({ error }, 'Failed to create job');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    }
  });

  // GET /v1/jobs/{id}: summarize pipeline status
  app.get('/v1/jobs/:id', {
    schema: {
      description: 'Get job status and artifacts',
      tags: ['Jobs'],
      security: [{ ApiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Job ID'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['pending', 'processing', 'completed', 'failed']
                },
                steps: {
                  type: 'object',
                  properties: {
                    captions: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        artifactKey: { type: 'string' },
                        url: { type: 'string' }
                      }
                    },
                    ad: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        artifactKey: { type: 'string' },
                        url: { type: 'string' }
                      }
                    },
                    color: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        artifactKey: { type: 'string' },
                        url: { type: 'string' }
                      }
                    },
                    videoTransform: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        artifactKey: { type: 'string' },
                        url: { type: 'string' },
                        cloudinaryUrl: { type: 'string' }
                      }
                    }
                  }
                },
                preset: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('get_job_status', (req as AuthenticatedRequest).requestId);
    
    try {
      const Params = z.object({ id: z.string() });
      const { id } = Params.parse(req.params);
      const tenantId = (req as AuthenticatedRequest).tenantId;
      
      if (!tenantId) {
        return res.code(401).send({ success: false, error: ErrorCodes.UNAUTHORIZED });
      }

      // Try idempotency cache first
      if (!redis) {
        return res.code(404).send({ success: false, error: ErrorCodes.NOT_FOUND });
      }
      
      const prefix = 'jobs:idempotency:';
      const stream = redis.scanStream({ match: `${prefix}*` });
      let bundle: JobBundle | null = null;
      
      for await (const keys of stream) {
        for (const key of keys) {
          const raw = await redis.get(key);
          if (raw) {
            const parsed = JSON.parse(raw) as JobBundle;
            if (parsed.id === id) {
              bundle = parsed;
              break;
            }
          }
        }
        if (bundle) break;
      }
      
      if (!bundle) {
        return res.code(404).send({ success: false, error: ErrorCodes.NOT_FOUND });
      }

      const [c, a, cl, vt] = await Promise.all([
        queues.captions.getJob(bundle.steps.captions),
        queues.ad.getJob(bundle.steps.ad),
        queues.color.getJob(bundle.steps.color),
        bundle.steps.videoTransform ? queues.videoTransform.getJob(bundle.steps.videoTransform) : Promise.resolve(null),
      ]);

      // Check job completion status (await promises)
      const cCompleted = c ? await c.isCompleted() : false;
      const cFailed = c ? !!c.failedReason : false;
      const aCompleted = a ? await a.isCompleted() : false;
      const aFailed = a ? !!a.failedReason : false;
      const clCompleted = cl ? await cl.isCompleted() : false;
      const clFailed = cl ? !!cl.failedReason : false;
      const vtCompleted = vt ? await vt.isCompleted() : false;
      const vtFailed = vt ? !!vt.failedReason : false;

      const status: JobStatusResponse['steps'] = {
        captions: {
          status: cCompleted ? 'completed' : cFailed ? 'failed' : 'pending',
          artifactKey: cCompleted && c ? (c.returnvalue as { artifactKey?: string })?.artifactKey : undefined,
        },
        ad: {
          status: aCompleted ? 'completed' : aFailed ? 'failed' : 'pending',
          artifactKey: aCompleted && a ? (a.returnvalue as { artifactKey?: string })?.artifactKey : undefined,
        },
        color: {
          status: clCompleted ? 'completed' : clFailed ? 'failed' : 'pending',
          artifactKey: clCompleted && cl ? (cl.returnvalue as { artifactKey?: string })?.artifactKey : undefined,
        },
        ...(vt ? {
          videoTransform: {
            status: vtCompleted ? 'completed' : vtFailed ? 'failed' : 'pending',
            artifactKey: vtCompleted ? (vt.returnvalue as { artifactKey?: string; cloudinaryUrl?: string })?.artifactKey : undefined,
            cloudinaryUrl: vtCompleted ? (vt.returnvalue as { artifactKey?: string; cloudinaryUrl?: string })?.cloudinaryUrl : undefined,
          },
        } : {}),
      };

      // Determine overall status
      const overallStatus: JobStatusResponse['status'] = 
        (status.videoTransform?.status === 'completed' || !status.videoTransform) &&
        status.captions?.status === 'completed' &&
        status.ad?.status === 'completed' &&
        status.color?.status === 'completed'
          ? 'completed'
          : status.captions?.status === 'failed' || status.ad?.status === 'failed' || status.color?.status === 'failed' || status.videoTransform?.status === 'failed'
          ? 'failed'
          : status.captions?.status === 'pending' && status.ad?.status === 'pending' && status.color?.status === 'pending' && (!status.videoTransform || status.videoTransform.status === 'pending')
          ? 'pending'
          : 'processing';

      // metrics
      if (cFailed || aFailed || clFailed || vtFailed) {
        failuresTotal.labels({ type: 'job' }).inc();
      }

      // Generate signed URLs for completed artifacts
      if (status.captions?.status === 'completed' && status.captions.artifactKey) {
        status.captions.url = await getSignedGetUrl(status.captions.artifactKey);
      }
      if (status.ad?.status === 'completed' && status.ad.artifactKey) {
        status.ad.url = await getSignedGetUrl(status.ad.artifactKey);
      }
      if (status.color?.status === 'completed' && status.color.artifactKey) {
        status.color.url = await getSignedGetUrl(status.color.artifactKey);
      }
      if (status.videoTransform?.status === 'completed' && status.videoTransform.artifactKey) {
        status.videoTransform.url = await getSignedGetUrl(status.videoTransform.artifactKey);
      }

      performanceMonitor.end(perfId);
      const response: ApiResponse<JobStatusResponse> = {
        success: true,
        data: {
          id,
          status: overallStatus,
          steps: status,
          preset: bundle.preset,
          createdAt: c?.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString(),
        },
      };
      return res.send(response);
    } catch (error) {
      performanceMonitor.end(perfId);
      if (error instanceof z.ZodError) {
        return res.code(400).send({
          success: false,
          error: ErrorCodes.VALIDATION_ERROR,
          details: error.errors,
        });
      }
      req.log.error({ error }, 'Failed to get job status');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

