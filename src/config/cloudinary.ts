import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger';

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  secure?: boolean;
}

export class CloudinaryClient {
  private isConfigured: boolean = false;

  constructor(config?: CloudinaryConfig) {
    this.configure(config);
  }

  private configure(config?: CloudinaryConfig): void {
    try {
      // If CLOUDINARY_URL is provided, it contains all config
      if (process.env.CLOUDINARY_URL) {
        cloudinary.config({
          cloudinary_url: process.env.CLOUDINARY_URL,
          secure: true
        });
        this.isConfigured = true;
        logger.info('Cloudinary configured via CLOUDINARY_URL');
        return;
      }

      // Manual configuration
      if (config?.cloudName && config?.apiKey && config?.apiSecret) {
        cloudinary.config({
          cloud_name: config.cloudName,
          api_key: config.apiKey,
          api_secret: config.apiSecret,
          secure: config.secure || true
        });
        this.isConfigured = true;
        logger.info('Cloudinary configured manually');
        return;
      }

      logger.warn('Cloudinary not configured - some features will be unavailable');
    } catch (error) {
      logger.error('Failed to configure Cloudinary', { error });
    }
  }

  /**
   * Upload video/image for analysis
   */
  async uploadMedia(
    filePath: string, 
    options: {
      folder?: string;
      publicId?: string;
      resourceType?: 'image' | 'video' | 'raw' | 'auto';
      transformation?: any;
    } = {}
  ): Promise<any> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: options.folder || 'sinna-media',
        public_id: options.publicId,
        resource_type: options.resourceType || 'auto',
        transformation: options.transformation,
        overwrite: true,
        invalidate: true,
      });

      logger.info('Media uploaded to Cloudinary', {
        publicId: result.public_id,
        secureUrl: result.secure_url,
        resourceType: result.resource_type,
        format: result.format,
        bytes: result.bytes
      });

      return result;
    } catch (error) {
      logger.error('Failed to upload media to Cloudinary', { error, filePath });
      throw error;
    }
  }

  /**
   * Extract video frames for color analysis
   */
  async extractVideoFrames(
    videoUrl: string,
    options: {
      frameCount?: number;
      startOffset?: number;
      interval?: number;
    } = {}
  ): Promise<string[]> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    try {
      const frameUrls: string[] = [];
      const frameCount = options.frameCount || 10;
      const interval = options.interval || 10; // seconds

      for (let i = 0; i < frameCount; i++) {
        const offset = (options.startOffset || 0) + (i * interval);
        
        // Generate frame extraction URL
        const frameUrl = cloudinary.url(videoUrl, {
          resource_type: 'video',
          transformation: [
            { 
              start_offset: `${offset}s`,
              format: 'jpg',
              quality: 'auto',
              width: 640,
              height: 360,
              crop: 'scale'
            }
          ]
        });

        frameUrls.push(frameUrl);
      }

      logger.info('Generated frame extraction URLs', {
        videoUrl,
        frameCount: frameUrls.length,
        interval
      });

      return frameUrls;
    } catch (error) {
      logger.error('Failed to extract video frames', { error, videoUrl });
      throw error;
    }
  }

  /**
   * Analyze dominant colors in image/video frame
   */
  async analyzeColors(mediaUrl: string): Promise<any> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    try {
      // Use Cloudinary's auto color analysis
      const analysisUrl = cloudinary.url(mediaUrl, {
        transformation: [
          { effect: 'auto_color' },
          { format: 'json' }
        ]
      });

      // In a real implementation, you'd fetch this URL to get color data
      // For now, we'll return a mock response
      const mockColorData = {
        dominant_colors: [
          { color: '#FF5733', percentage: 25.5 },
          { color: '#33FF57', percentage: 20.2 },
          { color: '#3357FF', percentage: 18.7 },
          { color: '#F0F0F0', percentage: 15.1 },
          { color: '#333333', percentage: 20.5 }
        ],
        contrast_ratio: 4.8,
        brightness: 0.65,
        saturation: 0.72
      };

      logger.info('Color analysis completed', {
        mediaUrl,
        dominantColors: mockColorData.dominant_colors.length,
        contrastRatio: mockColorData.contrast_ratio
      });

      return mockColorData;
    } catch (error) {
      logger.error('Failed to analyze colors', { error, mediaUrl });
      throw error;
    }
  }

  /**
   * Generate accessibility-friendly color palette
   */
  async generateAccessiblePalette(
    originalColors: Array<{ color: string; percentage: number }>,
    options: {
      minContrast?: number;
      colorBlindFriendly?: boolean;
    } = {}
  ): Promise<any> {
    try {
      const minContrast = options.minContrast || 4.5; // WCAG AA standard
      
      // Mock accessible palette generation
      const accessiblePalette = {
        original_colors: originalColors,
        accessible_alternatives: [
          { original: '#FF5733', accessible: '#D32F2F', contrast_ratio: 4.8 },
          { original: '#33FF57', accessible: '#388E3C', contrast_ratio: 5.2 },
          { original: '#3357FF', accessible: '#1976D2', contrast_ratio: 4.9 }
        ],
        colorblind_safe: options.colorBlindFriendly ? [
          { type: 'protanopia', colors: ['#1976D2', '#FFC107', '#4CAF50'] },
          { type: 'deuteranopia', colors: ['#2196F3', '#FF9800', '#8BC34A'] },
          { type: 'tritanopia', colors: ['#3F51B5', '#F44336', '#CDDC39'] }
        ] : [],
        recommendations: [
          'Increase contrast for better readability',
          'Consider color-blind friendly alternatives',
          'Use patterns or textures alongside colors'
        ]
      };

      logger.info('Generated accessible color palette', {
        originalCount: originalColors.length,
        alternativesCount: accessiblePalette.accessible_alternatives.length,
        minContrast
      });

      return accessiblePalette;
    } catch (error) {
      logger.error('Failed to generate accessible palette', { error });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      // Simple API call to check connectivity
      await cloudinary.api.ping();
      return true;
    } catch (error) {
      logger.error('Cloudinary health check failed', { error });
      return false;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}

// Singleton instance
let cloudinaryClient: CloudinaryClient | null = null;

export const getCloudinaryClient = (): CloudinaryClient => {
  if (!cloudinaryClient) {
    cloudinaryClient = new CloudinaryClient();
  }
  return cloudinaryClient;
};
