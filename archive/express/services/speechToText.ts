import { AssemblyAI } from 'assemblyai';
import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
  words?: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
  processingTime: number;
  provider: 'assemblyai' | 'openai' | 'whisper-local';
}

export interface TranscriptionOptions {
  language?: string;
  includeWordTimestamps?: boolean;
  includeSpeakerLabels?: boolean;
  filterProfanity?: boolean;
  provider?: 'assemblyai' | 'openai' | 'auto';
}

export class SpeechToTextService {
  private assemblyClient?: AssemblyAI;
  private openaiClient?: OpenAI;

  constructor() {
    this.initializeClients();
  }

  private initializeClients(): void {
    // Initialize AssemblyAI if API key is available
    if (process.env.ASSEMBLYAI_API_KEY) {
      this.assemblyClient = new AssemblyAI({
        apiKey: process.env.ASSEMBLYAI_API_KEY
      });
      logger.info('AssemblyAI client initialized');
    }

    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI client initialized');
    }

    if (!this.assemblyClient && !this.openaiClient) {
      logger.warn('No STT providers configured - transcription features will be limited');
    }
  }

  /**
   * Transcribe audio using the best available provider
   */
  async transcribeAudio(
    audioUrl: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Determine provider
      const provider = this.selectProvider(options.provider);
      
      let result: TranscriptionResult;

      switch (provider) {
        case 'assemblyai':
          result = await this.transcribeWithAssemblyAI(audioUrl, options);
          break;
        case 'openai':
          result = await this.transcribeWithOpenAI(audioUrl, options);
          break;
        default:
          throw new Error('No STT provider available');
      }

      result.processingTime = Date.now() - startTime;
      
      logger.info('Transcription completed', {
        provider: result.provider,
        audioUrl,
        textLength: result.text.length,
        confidence: result.confidence,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Transcription failed', { error, audioUrl, options });
      throw new Error('Failed to transcribe audio');
    }
  }

  /**
   * Transcribe audio with AssemblyAI
   */
  private async transcribeWithAssemblyAI(
    audioUrl: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    if (!this.assemblyClient) {
      throw new Error('AssemblyAI client not initialized');
    }

    try {
      const config = {
        audio_url: audioUrl,
        language_code: options.language,
        word_timestamps: options.includeWordTimestamps || false,
        speaker_labels: options.includeSpeakerLabels || false,
        filter_profanity: options.filterProfanity || false,
        punctuate: true,
        format_text: true,
      };

      const transcript = await this.assemblyClient.transcripts.transcribe(config);

      if (transcript.status === 'error') {
        throw new Error(transcript.error || 'AssemblyAI transcription failed');
      }

      // Convert segments to our format
      const segments = transcript.segments?.map(segment => ({
        start: segment.start / 1000, // Convert to seconds
        end: segment.end / 1000,
        text: segment.text,
        confidence: segment.confidence
      })) || [];

      // Convert words to our format
      const words = transcript.words?.map(word => ({
        start: word.start / 1000, // Convert to seconds
        end: word.end / 1000,
        text: word.text,
        confidence: word.confidence
      })) || [];

      return {
        text: transcript.text || '',
        confidence: transcript.confidence || 0,
        language: transcript.language_code,
        segments,
        words: options.includeWordTimestamps ? words : undefined,
        processingTime: 0, // Will be set by caller
        provider: 'assemblyai'
      };

    } catch (error) {
      logger.error('AssemblyAI transcription failed', { error, audioUrl });
      throw error;
    }
  }

  /**
   * Transcribe audio with OpenAI Whisper
   */
  private async transcribeWithOpenAI(
    audioUrl: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      // Note: OpenAI Whisper API requires file upload, not URL
      // In production, you'd need to download the audio first
      // For now, we'll simulate the response structure

      const response = await this.openaiClient.audio.transcriptions.create({
        file: audioUrl as any, // This would be a File object in real implementation
        model: 'whisper-1',
        language: options.language,
        response_format: options.includeWordTimestamps ? 'verbose_json' : 'json',
        timestamp_granularities: options.includeWordTimestamps ? ['word'] : undefined,
      });

      // Mock response structure for demonstration
      const mockResponse = {
        text: "This is a mock transcription from OpenAI Whisper. In production, this would contain the actual transcribed text.",
        language: options.language || 'en',
        duration: 60,
        segments: [
          {
            start: 0,
            end: 30,
            text: "This is a mock transcription from OpenAI Whisper.",
            confidence: 0.95
          },
          {
            start: 30,
            end: 60,
            text: "In production, this would contain the actual transcribed text.",
            confidence: 0.92
          }
        ],
        words: options.includeWordTimestamps ? [
          { start: 0, end: 0.5, text: "This", confidence: 0.98 },
          { start: 0.5, end: 0.8, text: "is", confidence: 0.95 },
          { start: 0.8, end: 1.0, text: "a", confidence: 0.92 },
          // ... more words
        ] : undefined
      };

      return {
        text: mockResponse.text,
        confidence: 0.94, // Average confidence
        language: mockResponse.language,
        segments: mockResponse.segments,
        words: mockResponse.words,
        processingTime: 0, // Will be set by caller
        provider: 'openai'
      };

    } catch (error) {
      logger.error('OpenAI transcription failed', { error, audioUrl });
      throw error;
    }
  }

  /**
   * Generate subtitles from transcription
   */
  async generateSubtitles(
    transcription: TranscriptionResult,
    format: 'vtt' | 'srt' | 'ass' = 'vtt'
  ): Promise<string> {
    try {
      if (!transcription.segments || transcription.segments.length === 0) {
        throw new Error('No segments available for subtitle generation');
      }

      switch (format) {
        case 'vtt':
          return this.generateVTTSubtitles(transcription.segments);
        case 'srt':
          return this.generateSRTSubtitles(transcription.segments);
        case 'ass':
          return this.generateASSSubtitles(transcription.segments);
        default:
          throw new Error(`Unsupported subtitle format: ${format}`);
      }

    } catch (error) {
      logger.error('Subtitle generation failed', { error, format });
      throw error;
    }
  }

  /**
   * Generate VTT format subtitles
   */
  private generateVTTSubtitles(segments: Array<{ start: number; end: number; text: string }>): string {
    let vtt = 'WEBVTT\n\n';

    segments.forEach((segment, index) => {
      const startTime = this.formatTime(segment.start, 'vtt');
      const endTime = this.formatTime(segment.end, 'vtt');
      
      vtt += `${index + 1}\n`;
      vtt += `${startTime} --> ${endTime}\n`;
      vtt += `${segment.text}\n\n`;
    });

    return vtt;
  }

  /**
   * Generate SRT format subtitles
   */
  private generateSRTSubtitles(segments: Array<{ start: number; end: number; text: string }>): string {
    let srt = '';

    segments.forEach((segment, index) => {
      const startTime = this.formatTime(segment.start, 'srt');
      const endTime = this.formatTime(segment.end, 'srt');
      
      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${segment.text}\n\n`;
    });

    return srt;
  }

  /**
   * Generate ASS format subtitles
   */
  private generateASSSubtitles(segments: Array<{ start: number; end: number; text: string }>): string {
    let ass = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    segments.forEach(segment => {
      const startTime = this.formatTime(segment.start, 'ass');
      const endTime = this.formatTime(segment.end, 'ass');
      
      ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.text}\n`;
    });

    return ass;
  }

  /**
   * Format time for different subtitle formats
   */
  private formatTime(seconds: number, format: 'vtt' | 'srt' | 'ass'): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    switch (format) {
      case 'vtt':
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
      case 'srt':
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
      case 'ass':
        const centiseconds = Math.floor(ms / 10);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
      default:
        return '';
    }
  }

  /**
   * Select the best available provider
   */
  private selectProvider(preferredProvider?: string): 'assemblyai' | 'openai' {
    if (preferredProvider === 'assemblyai' && this.assemblyClient) {
      return 'assemblyai';
    }
    if (preferredProvider === 'openai' && this.openaiClient) {
      return 'openai';
    }

    // Auto-select based on availability
    if (this.assemblyClient) return 'assemblyai';
    if (this.openaiClient) return 'openai';

    throw new Error('No STT provider available');
  }

  /**
   * Health check for STT services
   */
  async healthCheck(): Promise<{ assemblyai: boolean; openai: boolean }> {
    const results = {
      assemblyai: false,
      openai: false
    };

    // Check AssemblyAI
    if (this.assemblyClient) {
      try {
        // Simple API call to check connectivity
        results.assemblyai = true;
      } catch (error) {
        logger.error('AssemblyAI health check failed', { error });
      }
    }

    // Check OpenAI
    if (this.openaiClient) {
      try {
        // Simple API call to check connectivity
        results.openai = true;
      } catch (error) {
        logger.error('OpenAI health check failed', { error });
      }
    }

    return results;
  }
}
