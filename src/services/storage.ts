import { R2Client } from '../config/r2';
import { logger } from '../utils/logger';

export interface FileUploadMetadata {
  originalName: string;
  contentType: string;
  size?: number;
  userId?: string;
  tenantId?: string;
}

export interface SignedUrlResponse {
  uploadUrl: string;
  downloadUrl: string;
  key: string;
  expiresIn: number;
}

export class StorageService {
  private r2Client: R2Client;

  constructor(r2Client: R2Client) {
    this.r2Client = r2Client;
  }

  /**
   * Generate signed URLs for media upload and access
   */
  async generateMediaUrls(
    metadata: FileUploadMetadata,
    folder: 'subtitles' | 'audio' | 'video' | 'temp' = 'temp',
    expiresIn: number = 3600
  ): Promise<SignedUrlResponse> {
    try {
      // Generate unique key with folder structure
      const timestamp = Date.now();
      const fileExtension = this.getFileExtension(metadata.originalName);
      const sanitizedName = this.sanitizeFileName(metadata.originalName);
      
      const key = `${folder}/${metadata.tenantId || 'default'}/${timestamp}-${sanitizedName}${fileExtension}`;

      // Generate both upload and download URLs
      const [uploadUrl, downloadUrl] = await Promise.all([
        this.r2Client.getUploadUrl(key, expiresIn, metadata.contentType),
        this.r2Client.getDownloadUrl(key, expiresIn * 24) // Download URL valid longer
      ]);

      logger.info('Generated signed URLs', { 
        key, 
        folder, 
        tenantId: metadata.tenantId,
        expiresIn 
      });

      return {
        uploadUrl,
        downloadUrl,
        key,
        expiresIn
      };
    } catch (error) {
      logger.error('Failed to generate signed URLs', { error, metadata });
      throw new Error('Failed to generate storage URLs');
    }
  }

  /**
   * Generate signed URL for subtitle files
   */
  async generateSubtitleUrls(
    metadata: FileUploadMetadata,
    language: string,
    format: 'vtt' | 'srt' | 'ass' = 'vtt'
  ): Promise<SignedUrlResponse> {
    const enhancedMetadata = {
      ...metadata,
      originalName: `${language}-subtitles.${format}`,
      contentType: this.getSubtitleContentType(format)
    };

    return this.generateMediaUrls(enhancedMetadata, 'subtitles');
  }

  /**
   * Generate signed URL for audio description files
   */
  async generateAudioDescriptionUrls(
    metadata: FileUploadMetadata,
    language: string
  ): Promise<SignedUrlResponse> {
    const enhancedMetadata = {
      ...metadata,
      originalName: `${language}-audio-description.mp3`,
      contentType: 'audio/mpeg'
    };

    return this.generateMediaUrls(enhancedMetadata, 'audio');
  }

  /**
   * Get signed download URL for existing file
   */
  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await this.r2Client.getDownloadUrl(key, expiresIn);
    } catch (error) {
      logger.error('Failed to get download URL', { error, key });
      throw new Error('Failed to get download URL');
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const deleteUrl = await this.r2Client.getDeleteUrl(key);
      // In a real implementation, you'd make the DELETE request
      // For now, we just log it
      logger.info('Generated delete URL', { key, deleteUrl });
    } catch (error) {
      logger.error('Failed to delete file', { error, key });
      throw new Error('Failed to delete file');
    }
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }

  private sanitizeFileName(filename: string): string {
    // Remove extension and sanitize
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    return nameWithoutExt
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  private getSubtitleContentType(format: string): string {
    switch (format) {
      case 'vtt':
        return 'text/vtt';
      case 'srt':
        return 'application/x-subrip';
      case 'ass':
        return 'text/x-ass';
      default:
        return 'text/plain';
    }
  }
}
