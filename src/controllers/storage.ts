import { Request, Response } from 'express';
import { z } from 'zod';
import { StorageService } from '../services/storage';
import { logger } from '../utils/logger';

// Validation schemas
const generateUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  folder: z.enum(['subtitles', 'audio', 'video', 'temp']).optional(),
  language: z.string().optional(),
  format: z.enum(['vtt', 'srt', 'ass']).optional()
});

const getDownloadUrlSchema = z.object({
  key: z.string().min(1),
  expiresIn: z.number().min(60).max(86400).optional() // 1 minute to 24 hours
});

export class StorageController {
  private storageService: StorageService;

  constructor(storageService: StorageService) {
    this.storageService = storageService;
  }

  /**
   * Generate signed upload URL
   * POST /api/v1/storage/upload-url
   */
  generateUploadUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = generateUploadUrlSchema.parse(req.body);
      const userId = req.user?.id; // Assuming auth middleware sets req.user
      const tenantId = req.user?.tenantId;

      const metadata = {
        originalName: body.fileName,
        contentType: body.contentType,
        userId,
        tenantId
      };

      let result;

      // Handle different file types
      if (body.folder === 'subtitles' && body.language) {
        result = await this.storageService.generateSubtitleUrls(
          metadata, 
          body.language, 
          body.format || 'vtt'
        );
      } else if (body.folder === 'audio' && body.language) {
        result = await this.storageService.generateAudioDescriptionUrls(
          metadata, 
          body.language
        );
      } else {
        result = await this.storageService.generateMediaUrls(
          metadata, 
          body.folder || 'temp'
        );
      }

      res.status(200).json({
        success: true,
        data: result,
        message: 'Upload URLs generated successfully'
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

      logger.error('Failed to generate upload URL', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to generate upload URL'
      });
    }
  };

  /**
   * Get signed download URL
   * POST /api/v1/storage/download-url
   */
  getDownloadUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = getDownloadUrlSchema.parse(req.body);
      
      const downloadUrl = await this.storageService.getDownloadUrl(
        body.key, 
        body.expiresIn || 3600
      );

      res.status(200).json({
        success: true,
        data: {
          downloadUrl,
          key: body.key,
          expiresIn: body.expiresIn || 3600
        },
        message: 'Download URL generated successfully'
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

      logger.error('Failed to get download URL', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to get download URL'
      });
    }
  };

  /**
   * Delete file
   * DELETE /api/v1/storage/:key
   */
  deleteFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      
      if (!key) {
        res.status(400).json({
          success: false,
          error: 'File key is required'
        });
        return;
      }

      await this.storageService.deleteFile(decodeURIComponent(key));

      res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      logger.error('Failed to delete file', { error, key: req.params.key });
      res.status(500).json({
        success: false,
        error: 'Failed to delete file'
      });
    }
  };
}
