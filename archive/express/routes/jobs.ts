import { Router } from 'express';
import { JobsController } from '../controllers/jobs';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

export const createJobsRoutes = (jobsController: JobsController): Router => {
  const router = Router();

  // Apply authentication and rate limiting to all job routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @swagger
   * /api/v1/jobs/subtitles:
   *   post:
   *     summary: Create subtitle generation job
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - videoUrl
   *               - language
   *             properties:
   *               videoUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://example.com/video.mp4"
   *               language:
   *                 type: string
   *                 example: "en"
   *               format:
   *                 type: string
   *                 enum: [vtt, srt, ass]
   *                 default: vtt
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       201:
   *         description: Job created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/subtitles', jobsController.createSubtitleJob);

  /**
   * @swagger
   * /api/v1/jobs/audio-description:
   *   post:
   *     summary: Create audio description job
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - videoUrl
   *               - language
   *             properties:
   *               videoUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://example.com/video.mp4"
   *               language:
   *                 type: string
   *                 example: "en"
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       201:
   *         description: Job created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/audio-description', jobsController.createAudioDescriptionJob);

  /**
   * @swagger
   * /api/v1/jobs/color-analysis:
   *   post:
   *     summary: Create color analysis job
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - videoUrl
   *             properties:
   *               videoUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://example.com/video.mp4"
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       201:
   *         description: Job created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/color-analysis', jobsController.createColorAnalysisJob);

  /**
   * @swagger
   * /api/v1/jobs/transcription:
   *   post:
   *     summary: Create transcription job
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - audioUrl
   *             properties:
   *               audioUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://example.com/audio.mp3"
   *               language:
   *                 type: string
   *                 example: "en"
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       201:
   *         description: Job created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/transcription', jobsController.createTranscriptionJob);

  /**
   * @swagger
   * /api/v1/jobs/{queueName}/{jobId}:
   *   get:
   *     summary: Get job status
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: queueName
   *         required: true
   *         schema:
   *           type: string
   *           enum: [subtitle-generation, audio-description, color-analysis, transcription]
   *         example: "subtitle-generation"
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *         example: "subtitle-tenant123-1634567890123"
   *     responses:
   *       200:
   *         description: Job status retrieved successfully
   *       404:
   *         description: Job not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/:queueName/:jobId', jobsController.getJobStatus);

  /**
   * @swagger
   * /api/v1/jobs/stats:
   *   get:
   *     summary: Get queue statistics
   *     tags: [Jobs]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Queue statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     queues:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           name:
   *                             type: string
   *                           counts:
   *                             type: object
   *                             properties:
   *                               waiting:
   *                                 type: number
   *                               active:
   *                                 type: number
   *                               completed:
   *                                 type: number
   *                               failed:
   *                                 type: number
   *                               delayed:
   *                                 type: number
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/stats', jobsController.getQueueStats);

  return router;
};
