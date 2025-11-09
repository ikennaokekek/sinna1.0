#!/bin/bash
# One-liner fix for Render Shell - Copy and paste this entire script
cd /opt/render/project/src && \
sed -i 's|req.url.startsWith('\''/api-docs'\'')|req.url.startsWith('\''/api-docs'\'') \|\| req.url.startsWith('\''/billing/success'\'') \|\| req.url.startsWith('\''/billing/cancel'\'')|g' apps/api/src/index.ts && \
grep -q "app.get('/billing/success'" apps/api/src/index.ts || cat >> apps/api/src/index.ts << 'ENDPOINTS'

  // GET /billing/success - Public success page after Stripe payment
  app.get('/billing/success', {
    schema: {
      description: 'Success page after Stripe checkout completion',
      tags: ['Billing'],
      hide: true,
      querystring: {
        type: 'object',
        properties: {
          session_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            session_id: { type: 'string', nullable: true },
            note: { type: 'string', nullable: true }
          }
        }
      }
    }
  }, async (req, reply) => {
    const sessionId = (req.query as { session_id?: string })?.session_id;
    return reply.send({
      success: true,
      message: 'Payment successful! 🎉',
      session_id: sessionId || null,
      note: 'Your API key is being generated and will be emailed to you shortly. Please check your email inbox.'
    });
  });

  // GET /billing/cancel - Public cancel page after Stripe checkout cancellation
  app.get('/billing/cancel', {
    schema: {
      description: 'Cancel page after Stripe checkout cancellation',
      tags: ['Billing'],
      hide: true,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async () => ({
    success: false,
    message: 'Payment was cancelled. You can try again anytime.'
  }));

ENDPOINTS
pnpm -C apps/api build && echo "✅ Fix applied and rebuilt! Service will auto-restart."

