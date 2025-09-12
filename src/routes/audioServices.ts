import { Router } from 'express';
import { AudioServicesController } from '../controllers/audioServices';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

export const createAudioServicesRoutes = (audioServicesController: AudioServicesController): Router => {
  const router = Router();

  // Apply authentication and rate limiting to all audio service routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @swagger
   * /api/v1/audio/transcribe:
   *   post:
   *     summary: Transcribe audio to text
   *     tags: [Audio Services]
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
   *               includeWordTimestamps:
   *                 type: boolean
   *                 default: false
   *               includeSpeakerLabels:
   *                 type: boolean
   *                 default: false
   *               filterProfanity:
   *                 type: boolean
   *                 default: false
   *               provider:
   *                 type: string
   *                 enum: [assemblyai, openai, auto]
   *                 default: auto
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       200:
   *         description: Transcription completed (immediate processing)
   *       202:
   *         description: Transcription job queued (async processing)
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/transcribe', audioServicesController.transcribeAudio);

  /**
   * @swagger
   * /api/v1/audio/generate-subtitles:
   *   post:
   *     summary: Generate subtitles from audio
   *     tags: [Audio Services]
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
   *                 default: "en"
   *                 example: "en"
   *               format:
   *                 type: string
   *                 enum: [vtt, srt, ass]
   *                 default: vtt
   *               includeWordTimestamps:
   *                 type: boolean
   *                 default: true
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       200:
   *         description: Subtitles generated successfully (immediate processing)
   *       202:
   *         description: Subtitle generation job queued (async processing)
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/generate-subtitles', audioServicesController.generateSubtitles);

  /**
   * @swagger
   * /api/v1/audio/text-to-speech:
   *   post:
   *     summary: Generate speech from text
   *     tags: [Audio Services]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - text
   *             properties:
   *               text:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 5000
   *                 example: "Hello, this is a test of the text-to-speech service."
   *               voice:
   *                 type: string
   *                 example: "nova"
   *               speed:
   *                 type: number
   *                 minimum: 0.25
   *                 maximum: 4.0
   *                 default: 1.0
   *                 example: 1.0
   *               format:
   *                 type: string
   *                 enum: [mp3, wav, aac]
   *                 default: mp3
   *               quality:
   *                 type: string
   *                 enum: [low, medium, high]
   *                 default: medium
   *               provider:
   *                 type: string
   *                 enum: [openai, free, auto]
   *                 default: auto
   *     responses:
   *       200:
   *         description: Speech generated successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/text-to-speech', audioServicesController.generateSpeech);

  /**
   * @swagger
   * /api/v1/audio/audio-description:
   *   post:
   *     summary: Generate audio descriptions for video
   *     tags: [Audio Services]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - descriptions
   *             properties:
   *               descriptions:
   *                 type: array
   *                 minItems: 1
   *                 maxItems: 100
   *                 items:
   *                   type: object
   *                   required:
   *                     - time
   *                     - text
   *                   properties:
   *                     time:
   *                       type: number
   *                       minimum: 0
   *                       example: 10.5
   *                     text:
   *                       type: string
   *                       minLength: 1
   *                       maxLength: 500
   *                       example: "A woman walks across a busy street"
   *               voice:
   *                 type: string
   *                 example: "nova"
   *               speed:
   *                 type: number
   *                 minimum: 0.5
   *                 maximum: 2.0
   *                 default: 0.9
   *               format:
   *                 type: string
   *                 enum: [mp3, wav, aac]
   *                 default: mp3
   *               quality:
   *                 type: string
   *                 enum: [low, medium, high]
   *                 default: high
   *               provider:
   *                 type: string
   *                 enum: [openai, free, auto]
   *                 default: auto
   *     responses:
   *       200:
   *         description: Audio descriptions generated successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/audio-description', audioServicesController.generateAudioDescription);

  /**
   * @swagger
   * /api/v1/audio/voices:
   *   get:
   *     summary: Get available voices for TTS
   *     tags: [Audio Services]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Available voices retrieved successfully
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
   *                     voices:
   *                       type: object
   *                       additionalProperties:
   *                         type: array
   *                         items:
   *                           type: string
   *                     providers:
   *                       type: array
   *                       items:
   *                         type: string
   *                     totalVoices:
   *                       type: number
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/voices', audioServicesController.getAvailableVoices);

  /**
   * @swagger
   * /api/v1/audio/health:
   *   get:
   *     summary: Health check for audio services
   *     tags: [Audio Services]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Health status retrieved successfully
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
   *                     stt:
   *                       type: object
   *                       properties:
   *                         assemblyai:
   *                           type: boolean
   *                         openai:
   *                           type: boolean
   *                     tts:
   *                       type: object
   *                       properties:
   *                         openai:
   *                           type: boolean
   *                         freeTts:
   *                           type: boolean
   *                         system:
   *                           type: boolean
   *                     overall:
   *                       type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/health', audioServicesController.getHealthStatus);

  /**
   * @swagger
   * /api/v1/audio/generate-ssml:
   *   post:
   *     summary: Generate SSML for advanced speech control
   *     tags: [Audio Services]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - text
   *             properties:
   *               text:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 5000
   *                 example: "Hello world! This is important."
   *               voice:
   *                 type: string
   *                 example: "nova"
   *               rate:
   *                 type: string
   *                 example: "medium"
   *               pitch:
   *                 type: string
   *                 example: "medium"
   *               volume:
   *                 type: string
   *                 example: "medium"
   *               emphasis:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     text:
   *                       type: string
   *                     level:
   *                       type: string
   *                       enum: [strong, moderate, none]
   *               breaks:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     position:
   *                       type: number
   *                     duration:
   *                       type: string
   *     responses:
   *       200:
   *         description: SSML generated successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/generate-ssml', audioServicesController.generateSSML);

  return router;
};
