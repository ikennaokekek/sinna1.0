import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { getCloudinaryClient } from '../config/cloudinary';
import { logger } from '../utils/logger';

export interface ColorAnalysisResult {
  dominant_colors: Array<{
    color: string;
    percentage: number;
    rgb: { r: number; g: number; b: number };
    hsl: { h: number; s: number; l: number };
  }>;
  contrast_ratio: number;
  brightness: number;
  saturation: number;
  accessibility_score: number;
  recommendations: string[];
}

export interface VideoFrameExtractionOptions {
  frameCount?: number;
  startTime?: number;
  interval?: number;
  width?: number;
  height?: number;
  quality?: number;
}

export class MediaProcessingService {
  private cloudinaryClient = getCloudinaryClient();
  private tempDir = '/tmp/sinna-processing';

  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error, tempDir: this.tempDir });
    }
  }

  /**
   * Analyze colors in video using Cloudinary (primary) or ffmpeg (fallback)
   */
  async analyzeVideoColors(
    videoUrl: string,
    options: VideoFrameExtractionOptions = {}
  ): Promise<ColorAnalysisResult> {
    try {
      // Try Cloudinary first if available
      if (this.cloudinaryClient.isReady()) {
        return await this.analyzeColorsWithCloudinary(videoUrl, options);
      }

      // Fallback to local ffmpeg processing
      logger.info('Using ffmpeg fallback for color analysis', { videoUrl });
      return await this.analyzeColorsWithFFmpeg(videoUrl, options);

    } catch (error) {
      logger.error('Color analysis failed', { error, videoUrl });
      throw new Error('Failed to analyze video colors');
    }
  }

  /**
   * Color analysis using Cloudinary
   */
  private async analyzeColorsWithCloudinary(
    videoUrl: string,
    options: VideoFrameExtractionOptions
  ): Promise<ColorAnalysisResult> {
    try {
      // Extract frames from video
      const frameUrls = await this.cloudinaryClient.extractVideoFrames(videoUrl, {
        frameCount: options.frameCount || 5,
        startOffset: options.startTime || 10,
        interval: options.interval || 30
      });

      // Analyze colors in each frame
      const frameAnalyses = await Promise.all(
        frameUrls.map(frameUrl => this.cloudinaryClient.analyzeColors(frameUrl))
      );

      // Aggregate results
      return this.aggregateColorAnalysis(frameAnalyses);

    } catch (error) {
      logger.error('Cloudinary color analysis failed', { error, videoUrl });
      throw error;
    }
  }

  /**
   * Color analysis using ffmpeg + sharp (fallback)
   */
  private async analyzeColorsWithFFmpeg(
    videoUrl: string,
    options: VideoFrameExtractionOptions
  ): Promise<ColorAnalysisResult> {
    const frameCount = options.frameCount || 5;
    const interval = options.interval || 30;
    const tempFrames: string[] = [];

    try {
      // Extract frames using ffmpeg
      for (let i = 0; i < frameCount; i++) {
        const timestamp = (options.startTime || 10) + (i * interval);
        const framePath = path.join(this.tempDir, `frame_${Date.now()}_${i}.jpg`);
        
        await this.extractFrameWithFFmpeg(videoUrl, timestamp, framePath, {
          width: options.width || 640,
          height: options.height || 360,
          quality: options.quality || 80
        });

        tempFrames.push(framePath);
      }

      // Analyze colors in each frame using Sharp
      const frameAnalyses = await Promise.all(
        tempFrames.map(framePath => this.analyzeImageColors(framePath))
      );

      // Clean up temp files
      await this.cleanupTempFiles(tempFrames);

      // Aggregate results
      return this.aggregateColorAnalysis(frameAnalyses);

    } catch (error) {
      // Ensure cleanup even on error
      await this.cleanupTempFiles(tempFrames);
      throw error;
    }
  }

  /**
   * Extract a single frame from video using ffmpeg
   */
  private async extractFrameWithFFmpeg(
    videoUrl: string,
    timestamp: number,
    outputPath: string,
    options: { width: number; height: number; quality: number }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoUrl)
        .seekInput(timestamp)
        .frames(1)
        .size(`${options.width}x${options.height}`)
        .outputOptions(['-q:v', options.quality.toString()])
        .output(outputPath)
        .on('end', () => {
          logger.debug('Frame extracted', { videoUrl, timestamp, outputPath });
          resolve();
        })
        .on('error', (error) => {
          logger.error('Frame extraction failed', { error, videoUrl, timestamp });
          reject(error);
        })
        .run();
    });
  }

  /**
   * Analyze colors in an image using Sharp
   */
  private async analyzeImageColors(imagePath: string): Promise<any> {
    try {
      const image = sharp(imagePath);
      const { dominant } = await image.stats();
      
      // Get image metadata
      const metadata = await image.metadata();
      
      // Extract dominant colors (simplified implementation)
      const dominantColors = dominant.map((channel, index) => ({
        color: this.rgbToHex(channel.r || 0, channel.g || 0, channel.b || 0),
        percentage: 20, // Mock percentage
        rgb: { r: channel.r || 0, g: channel.g || 0, b: channel.b || 0 },
        hsl: this.rgbToHsl(channel.r || 0, channel.g || 0, channel.b || 0)
      }));

      return {
        dominant_colors: dominantColors.slice(0, 5),
        contrast_ratio: 4.5, // Mock value
        brightness: 0.6, // Mock value
        saturation: 0.7, // Mock value
        width: metadata.width,
        height: metadata.height
      };

    } catch (error) {
      logger.error('Image color analysis failed', { error, imagePath });
      throw error;
    }
  }

  /**
   * Aggregate color analysis results from multiple frames
   */
  private aggregateColorAnalysis(frameAnalyses: any[]): ColorAnalysisResult {
    // Simplified aggregation - in production, this would be more sophisticated
    const allColors: any[] = [];
    let totalContrast = 0;
    let totalBrightness = 0;
    let totalSaturation = 0;

    frameAnalyses.forEach(analysis => {
      if (analysis.dominant_colors) {
        allColors.push(...analysis.dominant_colors);
      }
      totalContrast += analysis.contrast_ratio || 0;
      totalBrightness += analysis.brightness || 0;
      totalSaturation += analysis.saturation || 0;
    });

    // Calculate averages
    const frameCount = frameAnalyses.length;
    const avgContrast = totalContrast / frameCount;
    const avgBrightness = totalBrightness / frameCount;
    const avgSaturation = totalSaturation / frameCount;

    // Get top 5 most frequent colors (simplified)
    const dominantColors = allColors.slice(0, 5);

    // Calculate accessibility score
    const accessibilityScore = this.calculateAccessibilityScore({
      contrast: avgContrast,
      brightness: avgBrightness,
      saturation: avgSaturation
    });

    // Generate recommendations
    const recommendations = this.generateAccessibilityRecommendations({
      contrast: avgContrast,
      brightness: avgBrightness,
      saturation: avgSaturation,
      colors: dominantColors
    });

    return {
      dominant_colors: dominantColors,
      contrast_ratio: avgContrast,
      brightness: avgBrightness,
      saturation: avgSaturation,
      accessibility_score: accessibilityScore,
      recommendations
    };
  }

  /**
   * Calculate accessibility score (0-100)
   */
  private calculateAccessibilityScore(metrics: {
    contrast: number;
    brightness: number;
    saturation: number;
  }): number {
    let score = 0;

    // Contrast score (40% weight)
    if (metrics.contrast >= 7) score += 40;
    else if (metrics.contrast >= 4.5) score += 30;
    else if (metrics.contrast >= 3) score += 20;
    else score += 10;

    // Brightness score (30% weight)
    if (metrics.brightness >= 0.4 && metrics.brightness <= 0.8) score += 30;
    else if (metrics.brightness >= 0.2 && metrics.brightness <= 0.9) score += 20;
    else score += 10;

    // Saturation score (30% weight)
    if (metrics.saturation >= 0.3 && metrics.saturation <= 0.8) score += 30;
    else if (metrics.saturation >= 0.1 && metrics.saturation <= 0.9) score += 20;
    else score += 10;

    return Math.round(score);
  }

  /**
   * Generate accessibility recommendations
   */
  private generateAccessibilityRecommendations(metrics: {
    contrast: number;
    brightness: number;
    saturation: number;
    colors: any[];
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.contrast < 4.5) {
      recommendations.push('Increase contrast ratio to meet WCAG AA standards (4.5:1 minimum)');
    }

    if (metrics.brightness < 0.3) {
      recommendations.push('Consider increasing overall brightness for better visibility');
    }

    if (metrics.brightness > 0.8) {
      recommendations.push('Reduce brightness to prevent eye strain');
    }

    if (metrics.saturation > 0.8) {
      recommendations.push('High saturation may cause issues for users with visual sensitivities');
    }

    recommendations.push('Consider providing color-blind friendly alternatives');
    recommendations.push('Test with screen readers and other assistive technologies');

    return recommendations;
  }

  /**
   * Utility functions
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
          logger.debug('Temp file cleaned up', { filePath });
        } catch (error) {
          logger.warn('Failed to clean up temp file', { error, filePath });
        }
      })
    );
  }
}
