import { Router } from 'express';
import { MonitoringController } from '../controllers/monitoring';
import { authMiddleware } from '../middleware/auth';

export const createMonitoringRoutes = (monitoringController: MonitoringController): Router => {
  const router = Router();

  // Public endpoints (no auth required)
  router.get('/health', monitoringController.healthCheck);
  router.get('/ping', monitoringController.ping);

  // Metrics endpoint (no auth for Prometheus scraping)
  router.get('/metrics', monitoringController.getMetrics);

  // Protected monitoring endpoints
  router.use('/v1/monitoring', authMiddleware);

  /**
   * @swagger
   * /api/v1/monitoring/system:
   *   get:
   *     summary: Get system information
   *     tags: [Monitoring]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: System information retrieved successfully
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
   *                     application:
   *                       type: object
   *                       properties:
   *                         name:
   *                           type: string
   *                         version:
   *                           type: string
   *                         environment:
   *                           type: string
   *                         uptime:
   *                           type: number
   *                         pid:
   *                           type: number
   *                     runtime:
   *                       type: object
   *                       properties:
   *                         nodeVersion:
   *                           type: string
   *                         platform:
   *                           type: string
   *                         architecture:
   *                           type: string
   *                         memory:
   *                           type: object
   *                         cpu:
   *                           type: object
   *                     features:
   *                       type: object
   *                       properties:
   *                         sentry:
   *                           type: boolean
   *                         metrics:
   *                           type: boolean
   *                         redis:
   *                           type: boolean
   *                         cloudinary:
   *                           type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/v1/monitoring/system', monitoringController.getSystemInfo);

  /**
   * @swagger
   * /api/v1/monitoring/stats:
   *   get:
   *     summary: Get service statistics overview
   *     tags: [Monitoring]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Service statistics retrieved successfully
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
   *                     requests:
   *                       type: object
   *                       description: Request statistics
   *                     queues:
   *                       type: object
   *                       description: Queue statistics
   *                     usage:
   *                       type: object
   *                       description: Feature usage statistics
   *                     storage:
   *                       type: object
   *                       description: Storage statistics
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *                     note:
   *                       type: string
   *                       description: Information about detailed metrics endpoint
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/v1/monitoring/stats', monitoringController.getServiceStats);

  /**
   * @swagger
   * /api/v1/monitoring/test-error:
   *   post:
   *     summary: Test error reporting (development only)
   *     tags: [Monitoring]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [generic, validation, auth, rate_limit]
   *                 default: generic
   *                 example: "validation"
   *               message:
   *                 type: string
   *                 default: "Test error from monitoring endpoint"
   *                 example: "Testing Sentry integration"
   *     responses:
   *       200:
   *         description: Test error captured successfully
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
   *                     eventId:
   *                       type: string
   *                       description: Sentry event ID
   *                     errorType:
   *                       type: string
   *                     message:
   *                       type: string
   *                     sentryInitialized:
   *                       type: boolean
   *       403:
   *         description: Not allowed in production
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/v1/monitoring/test-error', monitoringController.testError);

  return router;
};
