import { Router } from 'express';
import { StorageController } from '../controllers/storage';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

export const createStorageRoutes = (storageController: StorageController): Router => {
  const router = Router();

  // Apply authentication and rate limiting to all storage routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @swagger
   * /v1/storage/upload-url:
   *   post:
   *     summary: Generate signed upload URL
   *     tags: [Storage]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - fileName
   *               - contentType
   *             properties:
   *               fileName:
   *                 type: string
   *                 example: "video-subtitle.vtt"
   *               contentType:
   *                 type: string
   *                 example: "text/vtt"
   *               folder:
   *                 type: string
   *                 enum: [subtitles, audio, video, temp]
   *                 example: "subtitles"
   *               language:
   *                 type: string
   *                 example: "en"
   *               format:
   *                 type: string
   *                 enum: [vtt, srt, ass]
   *                 example: "vtt"
   *     responses:
   *       200:
   *         description: Upload URLs generated successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/upload-url', storageController.generateUploadUrl);

  /**
   * @swagger
   * /v1/storage/download-url:
   *   post:
   *     summary: Get signed download URL
   *     tags: [Storage]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - key
   *             properties:
   *               key:
   *                 type: string
   *                 example: "subtitles/tenant123/1234567890-video-subtitle.vtt"
   *               expiresIn:
   *                 type: number
   *                 minimum: 60
   *                 maximum: 86400
   *                 example: 3600
   *     responses:
   *       200:
   *         description: Download URL generated successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/download-url', storageController.getDownloadUrl);

  /**
   * @swagger
   * /v1/storage/{key}:
   *   delete:
   *     summary: Delete file
   *     tags: [Storage]
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         example: "subtitles/tenant123/1234567890-video-subtitle.vtt"
   *     responses:
   *       200:
   *         description: File deleted successfully
   *       400:
   *         description: Invalid key
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.delete('/:key(*)', storageController.deleteFile);

  return router;
};
