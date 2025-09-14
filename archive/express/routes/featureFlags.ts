/**
 * Feature Flags Routes
 * API endpoints for feature flag management and status
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { featureFlagMiddleware } from '../config/featureFlags';
import {
  getFeatureFlags,
  getFeatureFlag,
  getEnabledFlags,
  getFeatureRoadmap,
  getFeatureAnalytics
} from '../controllers/featureFlags';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     FeatureFlag:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Feature flag identifier
 *         description:
 *           type: string
 *           description: Human-readable description
 *         enabled:
 *           type: boolean
 *           description: Whether the flag is globally enabled
 *         isEnabled:
 *           type: boolean
 *           description: Whether the flag is enabled for current tenant
 *         rolloutPercentage:
 *           type: number
 *           description: Percentage of tenants that have access (0-100)
 *         requiresSubscription:
 *           type: array
 *           items:
 *             type: string
 *           description: Required subscription tiers
 *         environment:
 *           type: array
 *           items:
 *             type: string
 *           description: Allowed environments
 *         metadata:
 *           type: object
 *           description: Additional feature metadata
 *         canEnable:
 *           type: boolean
 *           description: Whether the feature can be enabled for current environment
 *         requiresUpgrade:
 *           type: boolean
 *           description: Whether a subscription upgrade is required
 *     
 *     FeatureFlagsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             totalFlags:
 *               type: number
 *             enabledFlags:
 *               type: number
 *             categories:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/FeatureFlag'
 *             summary:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: number
 *                 disabled:
 *                   type: number
 *                 requiresUpgrade:
 *                   type: number
 *                 comingSoon:
 *                   type: number
 *         message:
 *           type: string
 *     
 *     FeatureRoadmap:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             roadmap:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     estimatedRelease:
 *                       type: string
 *                     complexity:
 *                       type: string
 *                     category:
 *                       type: string
 *                     status:
 *                       type: string
 *             totalFeatures:
 *               type: number
 *             nextRelease:
 *               type: string
 *         message:
 *           type: string
 */

/**
 * @swagger
 * /v1/features:
 *   get:
 *     summary: Get all feature flags
 *     description: Retrieve all feature flags with their current status for the tenant
 *     tags: [Feature Flags]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Feature flags retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeatureFlagsResponse'
 *       401:
 *         description: Unauthorized - Invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/', authMiddleware, rateLimitMiddleware, featureFlagMiddleware, getFeatureFlags);

/**
 * @swagger
 * /v1/features/{flagName}:
 *   get:
 *     summary: Get specific feature flag
 *     description: Get detailed information about a specific feature flag
 *     tags: [Feature Flags]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: flagName
 *         required: true
 *         schema:
 *           type: string
 *         description: Feature flag name
 *         example: REALTIME_STREAMING
 *     responses:
 *       200:
 *         description: Feature flag retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FeatureFlag'
 *                 message:
 *                   type: string
 *       404:
 *         description: Feature flag not found
 *       401:
 *         description: Unauthorized - Invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/:flagName', authMiddleware, rateLimitMiddleware, featureFlagMiddleware, getFeatureFlag);

/**
 * @swagger
 * /v1/features/enabled:
 *   get:
 *     summary: Get enabled feature flags
 *     description: Get only the feature flags that are currently enabled for the tenant
 *     tags: [Feature Flags]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Enabled feature flags retrieved successfully
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
 *                     enabledFlags:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           metadata:
 *                             type: object
 *                     count:
 *                       type: number
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized - Invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/enabled', authMiddleware, rateLimitMiddleware, featureFlagMiddleware, getEnabledFlags);

/**
 * @swagger
 * /v1/features/roadmap:
 *   get:
 *     summary: Get feature roadmap
 *     description: Get the product roadmap showing upcoming features and their estimated release dates
 *     tags: [Feature Flags]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Feature roadmap retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeatureRoadmap'
 *       401:
 *         description: Unauthorized - Invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/roadmap', authMiddleware, rateLimitMiddleware, featureFlagMiddleware, getFeatureRoadmap);

/**
 * @swagger
 * /v1/features/analytics:
 *   get:
 *     summary: Get feature analytics
 *     description: Get usage analytics and recommendations for feature flags
 *     tags: [Feature Flags]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Feature analytics retrieved successfully
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
 *                     totalFlags:
 *                       type: number
 *                     enabledFlags:
 *                       type: number
 *                     usageStats:
 *                       type: object
 *                       properties:
 *                         mostUsed:
 *                           type: array
 *                           items:
 *                             type: string
 *                         leastUsed:
 *                           type: array
 *                           items:
 *                             type: string
 *                         recentlyEnabled:
 *                           type: array
 *                           items:
 *                             type: string
 *                     performance:
 *                       type: object
 *                       properties:
 *                         averageResponseTime:
 *                           type: string
 *                         errorRate:
 *                           type: string
 *                         uptime:
 *                           type: string
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized - Invalid API key
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/analytics', authMiddleware, rateLimitMiddleware, featureFlagMiddleware, getFeatureAnalytics);

export default router;
