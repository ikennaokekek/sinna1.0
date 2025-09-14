import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Job types for different accessibility features
export interface SubtitleGenerationJob {
  videoUrl: string;
  language: string;
  format: 'vtt' | 'srt' | 'ass';
  tenantId: string;
  userId: string;
  webhookUrl?: string;
}

export interface AudioDescriptionJob {
  videoUrl: string;
  language: string;
  tenantId: string;
  userId: string;
  webhookUrl?: string;
}

export interface ColorAnalysisJob {
  videoUrl: string;
  tenantId: string;
  userId: string;
  webhookUrl?: string;
}

export interface TranscriptionJob {
  audioUrl: string;
  language?: string;
  tenantId: string;
  userId: string;
  webhookUrl?: string;
}

// Job data union type
export type JobData = 
  | SubtitleGenerationJob 
  | AudioDescriptionJob 
  | ColorAnalysisJob 
  | TranscriptionJob;

export class QueueService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private redisClient = getRedisClient();

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues(): void {
    const queueNames = [
      'subtitle-generation',
      'audio-description', 
      'color-analysis',
      'transcription',
      'webhook-notifications'
    ];

    const queueOptions: QueueOptions = {
      connection: this.redisClient.getClient(),
      defaultJobOptions: {
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    };

    queueNames.forEach(name => {
      const queue = new Queue(name, queueOptions);
      this.queues.set(name, queue);
      logger.info(`Initialized queue: ${name}`);
    });
  }

  /**
   * Add subtitle generation job
   */
  async addSubtitleJob(data: SubtitleGenerationJob, priority: number = 0): Promise<Job> {
    const queue = this.queues.get('subtitle-generation');
    if (!queue) throw new Error('Subtitle generation queue not found');

    return queue.add('generate-subtitles', data, {
      priority,
      delay: 0,
      jobId: `subtitle-${data.tenantId}-${Date.now()}`,
    });
  }

  /**
   * Add audio description job
   */
  async addAudioDescriptionJob(data: AudioDescriptionJob, priority: number = 0): Promise<Job> {
    const queue = this.queues.get('audio-description');
    if (!queue) throw new Error('Audio description queue not found');

    return queue.add('generate-audio-description', data, {
      priority,
      delay: 0,
      jobId: `audio-desc-${data.tenantId}-${Date.now()}`,
    });
  }

  /**
   * Add color analysis job
   */
  async addColorAnalysisJob(data: ColorAnalysisJob, priority: number = 0): Promise<Job> {
    const queue = this.queues.get('color-analysis');
    if (!queue) throw new Error('Color analysis queue not found');

    return queue.add('analyze-colors', data, {
      priority,
      delay: 0,
      jobId: `color-${data.tenantId}-${Date.now()}`,
    });
  }

  /**
   * Add transcription job
   */
  async addTranscriptionJob(data: TranscriptionJob, priority: number = 0): Promise<Job> {
    const queue = this.queues.get('transcription');
    if (!queue) throw new Error('Transcription queue not found');

    return queue.add('transcribe-audio', data, {
      priority,
      delay: 0,
      jobId: `transcription-${data.tenantId}-${Date.now()}`,
    });
  }

  /**
   * Add webhook notification job
   */
  async addWebhookJob(data: { url: string; payload: any; tenantId: string }): Promise<Job> {
    const queue = this.queues.get('webhook-notifications');
    if (!queue) throw new Error('Webhook notifications queue not found');

    return queue.add('send-webhook', data, {
      priority: 1, // High priority for notifications
      delay: 0,
      jobId: `webhook-${data.tenantId}-${Date.now()}`,
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const job = await queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
    };
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      name: queueName,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      },
    };
  }

  /**
   * Get all queue stats
   */
  async getAllQueueStats(): Promise<any[]> {
    const stats = await Promise.all(
      Array.from(this.queues.keys()).map(name => this.getQueueStats(name))
    );
    return stats;
  }

  /**
   * Initialize workers (to be called in worker process)
   */
  initializeWorkers(): void {
    const workerOptions: WorkerOptions = {
      connection: this.redisClient.getClient(),
      concurrency: 5,
      removeOnComplete: 10,
      removeOnFail: 50,
    };

    // Subtitle generation worker
    const subtitleWorker = new Worker(
      'subtitle-generation',
      async (job: Job<SubtitleGenerationJob>) => {
        logger.info('Processing subtitle generation job', { jobId: job.id, data: job.data });
        // TODO: Implement actual subtitle generation logic
        await job.updateProgress(50);
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 5000));
        await job.updateProgress(100);
        return { status: 'completed', subtitleUrl: 'https://example.com/subtitle.vtt' };
      },
      workerOptions
    );

    this.workers.set('subtitle-generation', subtitleWorker);

    // Add event handlers
    subtitleWorker.on('completed', (job) => {
      logger.info('Subtitle job completed', { jobId: job.id });
    });

    subtitleWorker.on('failed', (job, err) => {
      logger.error('Subtitle job failed', { jobId: job?.id, error: err });
    });

    logger.info('Workers initialized');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down queue service...');

    // Close all workers
    await Promise.all(
      Array.from(this.workers.values()).map(worker => worker.close())
    );

    // Close all queues
    await Promise.all(
      Array.from(this.queues.values()).map(queue => queue.close())
    );

    logger.info('Queue service shut down complete');
  }

  /**
   * Get queue instance
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }
}
