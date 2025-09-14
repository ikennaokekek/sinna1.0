import { Request, Response } from 'express';
import { z } from 'zod';
import { QueueService } from '../services/queue';
import { logger } from '../utils/logger';

// Validation schemas
const subtitleJobSchema = z.object({
  videoUrl: z.string().url(),
  language: z.string().min(2).max(5),
  format: z.enum(['vtt', 'srt', 'ass']).default('vtt'),
  webhookUrl: z.string().url().optional(),
});

const audioDescriptionJobSchema = z.object({
  videoUrl: z.string().url(),
  language: z.string().min(2).max(5),
  webhookUrl: z.string().url().optional(),
});

const colorAnalysisJobSchema = z.object({
  videoUrl: z.string().url(),
  webhookUrl: z.string().url().optional(),
});

const transcriptionJobSchema = z.object({
  audioUrl: z.string().url(),
  language: z.string().min(2).max(5).optional(),
  webhookUrl: z.string().url().optional(),
});

const jobStatusSchema = z.object({
  queueName: z.string(),
  jobId: z.string(),
});

export class JobsController {
  private queueService: QueueService;

  constructor(queueService: QueueService) {
    this.queueService = queueService;
  }

  /**
   * Create subtitle generation job
   * POST /api/v1/jobs/subtitles
   */
  createSubtitleJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = subtitleJobSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const jobData = {
        ...body,
        userId,
        tenantId,
      };

      const job = await this.queueService.addSubtitleJob(jobData);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'subtitle-generation',
          status: 'queued',
          estimatedTime: '2-5 minutes',
        },
        message: 'Subtitle generation job created successfully',
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      logger.error('Failed to create subtitle job', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create subtitle job',
      });
    }
  };

  /**
   * Create audio description job
   * POST /api/v1/jobs/audio-description
   */
  createAudioDescriptionJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = audioDescriptionJobSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const jobData = {
        ...body,
        userId,
        tenantId,
      };

      const job = await this.queueService.addAudioDescriptionJob(jobData);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'audio-description',
          status: 'queued',
          estimatedTime: '5-10 minutes',
        },
        message: 'Audio description job created successfully',
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      logger.error('Failed to create audio description job', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create audio description job',
      });
    }
  };

  /**
   * Create color analysis job
   * POST /api/v1/jobs/color-analysis
   */
  createColorAnalysisJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = colorAnalysisJobSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const jobData = {
        ...body,
        userId,
        tenantId,
      };

      const job = await this.queueService.addColorAnalysisJob(jobData);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'color-analysis',
          status: 'queued',
          estimatedTime: '1-3 minutes',
        },
        message: 'Color analysis job created successfully',
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      logger.error('Failed to create color analysis job', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create color analysis job',
      });
    }
  };

  /**
   * Create transcription job
   * POST /api/v1/jobs/transcription
   */
  createTranscriptionJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = transcriptionJobSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const jobData = {
        ...body,
        userId,
        tenantId,
      };

      const job = await this.queueService.addTranscriptionJob(jobData);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'transcription',
          status: 'queued',
          estimatedTime: '3-7 minutes',
        },
        message: 'Transcription job created successfully',
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      logger.error('Failed to create transcription job', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create transcription job',
      });
    }
  };

  /**
   * Get job status
   * GET /api/v1/jobs/:queueName/:jobId
   */
  getJobStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { queueName, jobId } = req.params;

      if (!queueName || !jobId) {
        res.status(400).json({
          success: false,
          error: 'Queue name and job ID are required',
        });
        return;
      }

      const jobStatus = await this.queueService.getJobStatus(queueName, jobId);

      if (!jobStatus) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: jobStatus,
        message: 'Job status retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to get job status', { error, params: req.params });
      res.status(500).json({
        success: false,
        error: 'Failed to get job status',
      });
    }
  };

  /**
   * Get queue statistics
   * GET /api/v1/jobs/stats
   */
  getQueueStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.queueService.getAllQueueStats();

      res.status(200).json({
        success: true,
        data: {
          queues: stats,
          timestamp: new Date().toISOString(),
        },
        message: 'Queue statistics retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to get queue stats', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to get queue statistics',
      });
    }
  };
}
