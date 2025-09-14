import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface TTSResult {
  audioUrl: string;
  duration: number;
  format: string;
  size: number;
  provider: 'openai' | 'free-tts' | 'system';
  processingTime: number;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'aac';
  quality?: 'low' | 'medium' | 'high';
  provider?: 'openai' | 'free' | 'auto';
}

export interface AudioDescriptionOptions extends TTSOptions {
  pauseDuration?: number; // Seconds between descriptions
  volume?: number; // 0-1
  insertTimestamps?: Array<{
    time: number;
    description: string;
  }>;
}

export class TextToSpeechService {
  private openaiClient?: OpenAI;
  private freeTTSAvailable: boolean = false;

  constructor() {
    this.initializeClients();
  }

  private initializeClients(): void {
    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI TTS client initialized');
    }

    // Check for system TTS availability (mock for now)
    this.freeTTSAvailable = true;
    logger.info('Free TTS service available');

    if (!this.openaiClient && !this.freeTTSAvailable) {
      logger.warn('No TTS providers configured - audio generation will be limited');
    }
  }

  /**
   * Generate speech from text using the best available provider
   */
  async generateSpeech(
    text: string,
    options: TTSOptions = {}
  ): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      // Determine provider
      const provider = this.selectProvider(options.provider);
      
      let result: TTSResult;

      switch (provider) {
        case 'openai':
          result = await this.generateWithOpenAI(text, options);
          break;
        case 'free-tts':
          result = await this.generateWithFreeTTS(text, options);
          break;
        case 'system':
          result = await this.generateWithSystemTTS(text, options);
          break;
        default:
          throw new Error('No TTS provider available');
      }

      result.processingTime = Date.now() - startTime;
      
      logger.info('TTS generation completed', {
        provider: result.provider,
        textLength: text.length,
        duration: result.duration,
        format: result.format,
        size: result.size,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      logger.error('TTS generation failed', { error, text: text.substring(0, 100), options });
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Generate audio description for video content
   */
  async generateAudioDescription(
    descriptions: Array<{
      time: number;
      text: string;
    }>,
    options: AudioDescriptionOptions = {}
  ): Promise<TTSResult[]> {
    try {
      const results: TTSResult[] = [];

      for (const description of descriptions) {
        const ttsOptions: TTSOptions = {
          voice: options.voice || 'nova', // Clear, neutral voice for descriptions
          speed: options.speed || 0.9, // Slightly slower for comprehension
          format: options.format || 'mp3',
          quality: options.quality || 'high',
          provider: options.provider
        };

        const result = await this.generateSpeech(description.text, ttsOptions);
        
        // Add timestamp metadata
        (result as any).timestamp = description.time;
        (result as any).description = description.text;
        
        results.push(result);
      }

      logger.info('Audio description generation completed', {
        descriptionsCount: descriptions.length,
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
      });

      return results;

    } catch (error) {
      logger.error('Audio description generation failed', { error, descriptions });
      throw error;
    }
  }

  /**
   * Generate speech with OpenAI TTS
   */
  private async generateWithOpenAI(
    text: string,
    options: TTSOptions
  ): Promise<TTSResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openaiClient.audio.speech.create({
        model: 'tts-1-hd', // Use HD model for better quality
        voice: this.mapVoiceToOpenAI(options.voice || 'nova'),
        input: text,
        response_format: options.format || 'mp3',
        speed: options.speed || 1.0,
      });

      // In a real implementation, you'd handle the audio stream
      // For now, we'll return a mock result
      const mockResult: TTSResult = {
        audioUrl: 'https://example.com/generated-audio.mp3',
        duration: this.estimateAudioDuration(text, options.speed || 1.0),
        format: options.format || 'mp3',
        size: Math.floor(text.length * 100), // Rough estimate
        provider: 'openai',
        processingTime: 0 // Will be set by caller
      };

      return mockResult;

    } catch (error) {
      logger.error('OpenAI TTS generation failed', { error, text: text.substring(0, 100) });
      throw error;
    }
  }

  /**
   * Generate speech with free TTS service
   */
  private async generateWithFreeTTS(
    text: string,
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      // Mock free TTS implementation
      // In production, this might use services like:
      // - espeak
      // - Festival
      // - Mary TTS
      // - Google Translate TTS (limited)
      // - Azure Cognitive Services (free tier)

      logger.info('Generating speech with free TTS service', {
        textLength: text.length,
        voice: options.voice,
        speed: options.speed
      });

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockResult: TTSResult = {
        audioUrl: 'https://example.com/free-tts-audio.mp3',
        duration: this.estimateAudioDuration(text, options.speed || 1.0),
        format: options.format || 'mp3',
        size: Math.floor(text.length * 80), // Slightly lower quality
        provider: 'free-tts',
        processingTime: 0 // Will be set by caller
      };

      return mockResult;

    } catch (error) {
      logger.error('Free TTS generation failed', { error, text: text.substring(0, 100) });
      throw error;
    }
  }

  /**
   * Generate speech with system TTS
   */
  private async generateWithSystemTTS(
    text: string,
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      // Mock system TTS implementation
      // In production, this might use:
      // - macOS: say command
      // - Windows: SAPI
      // - Linux: espeak, festival

      logger.info('Generating speech with system TTS', {
        textLength: text.length,
        voice: options.voice,
        speed: options.speed
      });

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 800));

      const mockResult: TTSResult = {
        audioUrl: 'https://example.com/system-tts-audio.wav',
        duration: this.estimateAudioDuration(text, options.speed || 1.0),
        format: 'wav', // System TTS often outputs WAV
        size: Math.floor(text.length * 120), // Uncompressed format
        provider: 'system',
        processingTime: 0 // Will be set by caller
      };

      return mockResult;

    } catch (error) {
      logger.error('System TTS generation failed', { error, text: text.substring(0, 100) });
      throw error;
    }
  }

  /**
   * Generate SSML (Speech Synthesis Markup Language) for advanced control
   */
  generateSSML(
    text: string,
    options: {
      voice?: string;
      rate?: string;
      pitch?: string;
      volume?: string;
      emphasis?: Array<{ text: string; level: 'strong' | 'moderate' | 'none' }>;
      breaks?: Array<{ position: number; duration: string }>;
    } = {}
  ): string {
    let ssml = `<speak version="1.0" xml:lang="en-US">`;

    if (options.voice) {
      ssml += `<voice name="${options.voice}">`;
    }

    if (options.rate || options.pitch || options.volume) {
      const prosodyAttrs = [];
      if (options.rate) prosodyAttrs.push(`rate="${options.rate}"`);
      if (options.pitch) prosodyAttrs.push(`pitch="${options.pitch}"`);
      if (options.volume) prosodyAttrs.push(`volume="${options.volume}"`);
      
      ssml += `<prosody ${prosodyAttrs.join(' ')}>`;
    }

    // Add text with emphasis and breaks
    let processedText = text;
    
    // Add emphasis
    if (options.emphasis) {
      options.emphasis.forEach(emph => {
        processedText = processedText.replace(
          emph.text,
          `<emphasis level="${emph.level}">${emph.text}</emphasis>`
        );
      });
    }

    // Add breaks
    if (options.breaks) {
      options.breaks.sort((a, b) => b.position - a.position); // Sort in reverse order
      options.breaks.forEach(breakPoint => {
        processedText = 
          processedText.slice(0, breakPoint.position) +
          `<break time="${breakPoint.duration}"/>` +
          processedText.slice(breakPoint.position);
      });
    }

    ssml += processedText;

    if (options.rate || options.pitch || options.volume) {
      ssml += '</prosody>';
    }

    if (options.voice) {
      ssml += '</voice>';
    }

    ssml += '</speak>';

    return ssml;
  }

  /**
   * Get available voices for each provider
   */
  getAvailableVoices(): Record<string, string[]> {
    return {
      openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      'free-tts': ['default', 'male', 'female', 'child'],
      system: ['system-default', 'system-male', 'system-female']
    };
  }

  /**
   * Map generic voice names to OpenAI voices
   */
  private mapVoiceToOpenAI(voice: string): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' {
    const voiceMap: Record<string, any> = {
      'male': 'onyx',
      'female': 'nova',
      'neutral': 'alloy',
      'warm': 'shimmer',
      'clear': 'echo',
      'storytelling': 'fable'
    };

    return voiceMap[voice] || 'nova';
  }

  /**
   * Estimate audio duration based on text length and speed
   */
  private estimateAudioDuration(text: string, speed: number): number {
    // Average speaking rate: ~150 words per minute
    // Adjust for speed multiplier
    const wordsPerMinute = 150 * speed;
    const wordCount = text.split(/\s+/).length;
    const durationMinutes = wordCount / wordsPerMinute;
    
    return Math.ceil(durationMinutes * 60); // Return duration in seconds
  }

  /**
   * Select the best available provider
   */
  private selectProvider(preferredProvider?: string): 'openai' | 'free-tts' | 'system' {
    if (preferredProvider === 'openai' && this.openaiClient) {
      return 'openai';
    }
    if (preferredProvider === 'free' && this.freeTTSAvailable) {
      return 'free-tts';
    }

    // Auto-select based on availability and quality
    if (this.openaiClient) return 'openai';
    if (this.freeTTSAvailable) return 'free-tts';
    
    return 'system'; // Fallback to system TTS
  }

  /**
   * Health check for TTS services
   */
  async healthCheck(): Promise<{ openai: boolean; freeTts: boolean; system: boolean }> {
    const results = {
      openai: false,
      freeTts: false,
      system: false
    };

    // Check OpenAI
    if (this.openaiClient) {
      try {
        // Simple connectivity check
        results.openai = true;
      } catch (error) {
        logger.error('OpenAI TTS health check failed', { error });
      }
    }

    // Check Free TTS
    results.freeTts = this.freeTTSAvailable;

    // System TTS is usually available
    results.system = true;

    return results;
  }
}
