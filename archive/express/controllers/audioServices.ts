import { Request, Response } from 'express';
import { z } from 'zod';
import { SpeechToTextService } from '../services/speechToText';
import { TextToSpeechService } from '../services/textToSpeech';
import { QueueService } from '../services/queue';
import { logger } from '../utils/logger';

// Validation schemas
const transcriptionSchema = z.object({
  audioUrl: z.string().url(),
  language: z.string().min(2).max(5).optional(),
  includeWordTimestamps: z.boolean().default(false),
  includeSpeakerLabels: z.boolean().default(false),
  filterProfanity: z.boolean().default(false),
  provider: z.enum(['assemblyai', 'openai', 'auto']).default('auto'),
  webhookUrl: z.string().url().optional(),
});

const subtitleGenerationSchema = z.object({
  audioUrl: z.string().url(),
  language: z.string().min(2).max(5).default('en'),
  format: z.enum(['vtt', 'srt', 'ass']).default('vtt'),
  includeWordTimestamps: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
});

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  format: z.enum(['mp3', 'wav', 'aac']).default('mp3'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  provider: z.enum(['openai', 'free', 'auto']).default('auto'),
});

const audioDescriptionSchema = z.object({
  descriptions: z.array(z.object({
    time: z.number().min(0),
    text: z.string().min(1).max(500),
  })).min(1).max(100),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).default(0.9),
  format: z.enum(['mp3', 'wav', 'aac']).default('mp3'),
  quality: z.enum(['low', 'medium', 'high']).default('high'),
  provider: z.enum(['openai', 'free', 'auto']).default('auto'),
});

export class AudioServicesController {
  private sttService: SpeechToTextService;
  private ttsService: TextToSpeechService;
  private queueService: QueueService;

  constructor(
    sttService: SpeechToTextService,
    ttsService: TextToSpeechService,
    queueService: QueueService
  ) {
    this.sttService = sttService;
    this.ttsService = ttsService;
    this.queueService = queueService;
  }

  /**
   * Transcribe audio to text
   * POST /api/v1/audio/transcribe
   */
  transcribeAudio = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = transcriptionSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      // For quick transcription, process immediately
      if (!body.webhookUrl) {
        const result = await this.sttService.transcribeAudio(body.audioUrl, {
          language: body.language,
          includeWordTimestamps: body.includeWordTimestamps,
          includeSpeakerLabels: body.includeSpeakerLabels,
          filterProfanity: body.filterProfanity,
          provider: body.provider
        });

        res.status(200).json({
          success: true,
          data: {
            transcription: result,
            processedAt: new Date().toISOString(),
            processingMethod: 'immediate'
          },
          message: 'Audio transcription completed successfully'
        });
        return;
      }

      // For webhook delivery, queue the job
      const job = await this.queueService.addTranscriptionJob({
        audioUrl: body.audioUrl,
        language: body.language,
        tenantId,
        userId,
        webhookUrl: body.webhookUrl
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'transcription',
          status: 'queued',
          estimatedTime: '3-7 minutes',
          processingMethod: 'async'
        },
        message: 'Transcription job queued successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Audio transcription failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to transcribe audio'
      });
    }
  };

  /**
   * Generate subtitles from audio
   * POST /api/v1/audio/generate-subtitles
   */
  generateSubtitles = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = subtitleGenerationSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      // For quick generation, process immediately
      if (!body.webhookUrl) {
        // First transcribe the audio
        const transcription = await this.sttService.transcribeAudio(body.audioUrl, {
          language: body.language,
          includeWordTimestamps: body.includeWordTimestamps,
          provider: 'auto'
        });

        // Then generate subtitles
        const subtitles = await this.sttService.generateSubtitles(transcription, body.format);

        res.status(200).json({
          success: true,
          data: {
            subtitles,
            format: body.format,
            language: body.language,
            transcription: {
              confidence: transcription.confidence,
              segmentCount: transcription.segments?.length || 0,
              wordCount: transcription.words?.length || 0
            },
            processedAt: new Date().toISOString(),
            processingMethod: 'immediate'
          },
          message: 'Subtitles generated successfully'
        });
        return;
      }

      // For webhook delivery, queue the job
      const job = await this.queueService.addSubtitleJob({
        videoUrl: body.audioUrl, // Using audioUrl as videoUrl for this endpoint
        language: body.language,
        format: body.format,
        tenantId,
        userId,
        webhookUrl: body.webhookUrl
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          queueName: 'subtitle-generation',
          status: 'queued',
          estimatedTime: '2-5 minutes',
          processingMethod: 'async'
        },
        message: 'Subtitle generation job queued successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Subtitle generation failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to generate subtitles'
      });
    }
  };

  /**
   * Generate speech from text
   * POST /api/v1/audio/text-to-speech
   */
  generateSpeech = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = ttsSchema.parse(req.body);

      const result = await this.ttsService.generateSpeech(body.text, {
        voice: body.voice,
        speed: body.speed,
        format: body.format,
        quality: body.quality,
        provider: body.provider
      });

      res.status(200).json({
        success: true,
        data: {
          audio: result,
          text: body.text,
          processedAt: new Date().toISOString()
        },
        message: 'Speech generation completed successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Speech generation failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to generate speech'
      });
    }
  };

  /**
   * Generate audio descriptions for video
   * POST /api/v1/audio/audio-description
   */
  generateAudioDescription = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = audioDescriptionSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const results = await this.ttsService.generateAudioDescription(body.descriptions, {
        voice: body.voice,
        speed: body.speed,
        format: body.format,
        quality: body.quality,
        provider: body.provider
      });

      res.status(200).json({
        success: true,
        data: {
          audioDescriptions: results,
          totalDescriptions: results.length,
          totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
          processedAt: new Date().toISOString()
        },
        message: 'Audio descriptions generated successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Audio description generation failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to generate audio descriptions'
      });
    }
  };

  /**
   * Get available voices for TTS
   * GET /api/v1/audio/voices
   */
  getAvailableVoices = async (req: Request, res: Response): Promise<void> => {
    try {
      const voices = this.ttsService.getAvailableVoices();

      res.status(200).json({
        success: true,
        data: {
          voices,
          providers: Object.keys(voices),
          totalVoices: Object.values(voices).flat().length
        },
        message: 'Available voices retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get available voices', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve available voices'
      });
    }
  };

  /**
   * Health check for audio services
   * GET /api/v1/audio/health
   */
  getHealthStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const [sttHealth, ttsHealth] = await Promise.all([
        this.sttService.healthCheck(),
        this.ttsService.healthCheck()
      ]);

      const overallHealth = {
        stt: sttHealth,
        tts: ttsHealth,
        overall: Object.values(sttHealth).some(Boolean) && Object.values(ttsHealth).some(Boolean)
      };

      res.status(200).json({
        success: true,
        data: overallHealth,
        message: 'Audio services health status retrieved'
      });

    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to check health status'
      });
    }
  };

  /**
   * Generate SSML for advanced speech control
   * POST /api/v1/audio/generate-ssml
   */
  generateSSML = async (req: Request, res: Response): Promise<void> => {
    try {
      const schema = z.object({
        text: z.string().min(1).max(5000),
        voice: z.string().optional(),
        rate: z.string().optional(),
        pitch: z.string().optional(),
        volume: z.string().optional(),
        emphasis: z.array(z.object({
          text: z.string(),
          level: z.enum(['strong', 'moderate', 'none'])
        })).optional(),
        breaks: z.array(z.object({
          position: z.number(),
          duration: z.string()
        })).optional()
      });

      const body = schema.parse(req.body);

      const ssml = this.ttsService.generateSSML(body.text, {
        voice: body.voice,
        rate: body.rate,
        pitch: body.pitch,
        volume: body.volume,
        emphasis: body.emphasis,
        breaks: body.breaks
      });

      res.status(200).json({
        success: true,
        data: {
          ssml,
          originalText: body.text,
          generatedAt: new Date().toISOString()
        },
        message: 'SSML generated successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('SSML generation failed', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to generate SSML'
      });
    }
  };
}
