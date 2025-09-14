import { Router } from 'express';
import { AccessibilityController } from '../controllers/accessibility';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

export const createAccessibilityRoutes = (accessibilityController: AccessibilityController): Router => {
  const router = Router();

  // Apply authentication and rate limiting to all accessibility routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @swagger
   * /api/v1/accessibility/color-analysis:
   *   post:
   *     summary: Analyze video colors for accessibility
   *     tags: [Accessibility]
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
   *               frameCount:
   *                 type: number
   *                 minimum: 1
   *                 maximum: 20
   *                 default: 5
   *                 example: 5
   *               startTime:
   *                 type: number
   *                 minimum: 0
   *                 default: 10
   *                 example: 10
   *               interval:
   *                 type: number
   *                 minimum: 5
   *                 maximum: 300
   *                 default: 30
   *                 example: 30
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       200:
   *         description: Color analysis completed (immediate processing)
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
   *                     analysis:
   *                       type: object
   *                       properties:
   *                         dominant_colors:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               color:
   *                                 type: string
   *                               percentage:
   *                                 type: number
   *                               rgb:
   *                                 type: object
   *                               hsl:
   *                                 type: object
   *                         contrast_ratio:
   *                           type: number
   *                         accessibility_score:
   *                           type: number
   *                         recommendations:
   *                           type: array
   *                           items:
   *                             type: string
   *       202:
   *         description: Color analysis job queued (async processing)
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/color-analysis', accessibilityController.analyzeColors);

  /**
   * @swagger
   * /api/v1/accessibility/audit:
   *   post:
   *     summary: Perform comprehensive accessibility audit
   *     tags: [Accessibility]
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
   *               checkContrast:
   *                 type: boolean
   *                 default: true
   *                 example: true
   *               checkColorBlindness:
   *                 type: boolean
   *                 default: true
   *                 example: true
   *               checkMotionSensitivity:
   *                 type: boolean
   *                 default: false
   *                 example: false
   *               webhookUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/webhook"
   *     responses:
   *       200:
   *         description: Accessibility audit completed successfully
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
   *                     auditId:
   *                       type: string
   *                     overallScore:
   *                       type: number
   *                     overallPassed:
   *                       type: boolean
   *                     checks:
   *                       type: object
   *                     summaryRecommendations:
   *                       type: array
   *                       items:
   *                         type: string
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/audit', accessibilityController.performAccessibilityAudit);

  /**
   * @swagger
   * /api/v1/accessibility/guidelines:
   *   get:
   *     summary: Get accessibility guidelines and best practices
   *     tags: [Accessibility]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Accessibility guidelines retrieved successfully
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
   *                     wcagVersion:
   *                       type: string
   *                     levels:
   *                       type: array
   *                       items:
   *                         type: string
   *                     categories:
   *                       type: object
   *                     bestPractices:
   *                       type: array
   *                       items:
   *                         type: string
   *                     tools:
   *                       type: array
   *                       items:
   *                         type: string
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/guidelines', accessibilityController.getAccessibilityGuidelines);

  return router;
};
