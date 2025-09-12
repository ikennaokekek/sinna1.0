import { Router } from 'express';
import { BillingController } from '../controllers/billing';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

export const createBillingRoutes = (billingController: BillingController): Router => {
  const router = Router();

  // Webhook endpoint (no auth required, Stripe signature verification instead)
  router.post('/webhook', billingController.handleWebhook);

  // Apply authentication and rate limiting to other billing routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware);

  /**
   * @swagger
   * /api/v1/billing/plans:
   *   get:
   *     summary: Get available subscription plans
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Subscription plans retrieved successfully
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
   *                     plans:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           name:
   *                             type: string
   *                           price:
   *                             type: number
   *                           currency:
   *                             type: string
   *                           interval:
   *                             type: string
   *                           features:
   *                             type: object
   *                           recommended:
   *                             type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/plans', billingController.getPlans);

  /**
   * @swagger
   * /api/v1/billing/customer:
   *   post:
   *     summary: Create Stripe customer
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "user@example.com"
   *               name:
   *                 type: string
   *                 example: "John Doe"
   *               metadata:
   *                 type: object
   *                 additionalProperties:
   *                   type: string
   *     responses:
   *       201:
   *         description: Customer created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/customer', billingController.createCustomer);

  /**
   * @swagger
   * /api/v1/billing/checkout:
   *   post:
   *     summary: Create checkout session for subscription
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - planId
   *             properties:
   *               planId:
   *                 type: string
   *                 enum: [standard, gold]
   *                 example: "standard"
   *               successUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/success"
   *               cancelUrl:
   *                 type: string
   *                 format: uri
   *                 example: "https://your-app.com/cancel"
   *     responses:
   *       201:
   *         description: Checkout session created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/checkout', billingController.createCheckout);

  /**
   * @swagger
   * /api/v1/billing/portal:
   *   post:
   *     summary: Create customer portal session
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Portal session created successfully
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
   *                     portalUrl:
   *                       type: string
   *                       format: uri
   *       404:
   *         description: Customer not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/portal', billingController.createPortal);

  /**
   * @swagger
   * /api/v1/billing/subscription:
   *   get:
   *     summary: Get current subscription and usage
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: Subscription details retrieved successfully
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
   *                     customer:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                         email:
   *                           type: string
   *                         subscriptionStatus:
   *                           type: string
   *                         currentPeriodEnd:
   *                           type: string
   *                           format: date-time
   *                     plan:
   *                       type: object
   *                     usage:
   *                       type: object
   *                       properties:
   *                         current:
   *                           type: object
   *                         billing:
   *                           type: object
   *                     hasActiveSubscription:
   *                       type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/subscription', billingController.getSubscription);

  /**
   * @swagger
   * /api/v1/billing/cancel:
   *   post:
   *     summary: Cancel subscription
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               immediately:
   *                 type: boolean
   *                 default: false
   *                 description: "Cancel immediately or at period end"
   *     responses:
   *       200:
   *         description: Subscription cancelled successfully
   *       404:
   *         description: No active subscription found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.post('/cancel', billingController.cancelSubscription);

  /**
   * @swagger
   * /api/v1/billing/history:
   *   get:
   *     summary: Get billing history
   *     tags: [Billing]
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *           minimum: 1
   *           maximum: 100
   *         description: Number of invoices to retrieve
   *     responses:
   *       200:
   *         description: Billing history retrieved successfully
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
   *                     invoices:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           date:
   *                             type: string
   *                             format: date-time
   *                           amount:
   *                             type: number
   *                           currency:
   *                             type: string
   *                           status:
   *                             type: string
   *                           description:
   *                             type: string
   *                           downloadUrl:
   *                             type: string
   *                             format: uri
   *                     hasMore:
   *                       type: boolean
   *                     customerId:
   *                       type: string
   *       404:
   *         description: Customer not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/history', billingController.getBillingHistory);

  return router;
};
