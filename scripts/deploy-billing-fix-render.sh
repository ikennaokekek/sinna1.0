#!/bin/bash
# Quick fix script to deploy billing endpoints directly on Render
# Run this in Render Shell: cd /opt/render/project/src && bash scripts/deploy-billing-fix-render.sh

echo "🔧 Deploying Billing Endpoints Fix to Render..."
echo ""

FILE="apps/api/src/index.ts"
BACKUP="${FILE}.backup.$(date +%s)"

# Backup
cp "$FILE" "$BACKUP"
echo "✅ Backup created: $BACKUP"

# Fix 1: Update auth bypass (line ~158-165)
echo "📝 Fixing auth bypass..."
sed -i 's|req.url.startsWith('\''/api-docs'\'')|req.url.startsWith('\''/api-docs'\'') \|\| req.url.startsWith('\''/billing/success'\'') \|\| req.url.startsWith('\''/billing/cancel'\'')|g' "$FILE"

# Fix 2: Add /billing/success endpoint after /v1/demo
echo "📝 Adding /billing/success endpoint..."
# Find line after /v1/demo endpoint
LINE_NUM=$(grep -n "async () => ({ ok: true, now:" "$FILE" | head -1 | cut -d: -f1)

if [ -n "$LINE_NUM" ]; then
  # Create the billing endpoints code
  cat > /tmp/billing_endpoints.txt << 'ENDPOINTS'
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
  
  # Insert after /v1/demo
  sed -i "${LINE_NUM}r /tmp/billing_endpoints.txt" "$FILE"
  rm /tmp/billing_endpoints.txt
  echo "✅ Billing endpoints added"
else
  echo "⚠️  Could not find insertion point for billing endpoints"
fi

# Fix 3: Update BASE_URL to BASE_URL_PUBLIC in Swagger
echo "📝 Updating Swagger to use BASE_URL_PUBLIC..."
sed -i 's|process.env.BASE_URL ||process.env.BASE_URL_PUBLIC ||g' "$FILE"

# Rebuild
echo ""
echo "🔨 Rebuilding API..."
cd apps/api
pnpm build

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Build successful!"
  echo ""
  echo "🔄 Next: Restart the service"
  echo "   The service should auto-restart, or manually restart from Render Dashboard"
  echo ""
  echo "🧪 Test after restart:"
  echo "   curl https://sinna.site/billing/success"
  echo "   Expected: {\"success\":true,\"message\":\"Payment successful! 🎉\",...}"
else
  echo ""
  echo "❌ Build failed! Check errors above."
  echo "   Restore backup: cp $BACKUP $FILE"
  exit 1
fi

