#!/bin/bash
# Quick fix script to update billing endpoints on Render
# Run this in Render Shell: cd /opt/render/project/src && bash scripts/fix-billing-endpoints-render.sh

echo "🔧 Fixing billing endpoints on Render..."
echo ""

FILE="apps/api/src/index.ts"

# Check if file exists
if [ ! -f "$FILE" ]; then
  echo "❌ File not found: $FILE"
  exit 1
fi

# Backup original
cp "$FILE" "$FILE.backup"
echo "✅ Backup created: $FILE.backup"

# Fix 1: Add billing pages to auth bypass
echo "📝 Updating auth bypass..."
sed -i 's|req.url.startsWith('\''/api-docs'\'')|req.url.startsWith('\''/api-docs'\'') \|\| req.url.startsWith('\''/billing/success'\'') \|\| req.url.startsWith('\''/billing/cancel'\'')|g' "$FILE"

# Fix 2: Add /billing/success endpoint (check if it exists first)
if ! grep -q "GET /billing/success" "$FILE"; then
  echo "📝 Adding /billing/success endpoint..."
  
  # Find the line after /v1/demo endpoint
  LINE_NUM=$(grep -n "async () => ({ ok: true, now:" "$FILE" | head -1 | cut -d: -f1)
  
  if [ -n "$LINE_NUM" ]; then
    # Insert the billing endpoints after /v1/demo
    cat >> /tmp/billing_endpoints.txt << 'ENDPOINTS'
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
    
    # Insert after /v1/demo endpoint
    sed -i "${LINE_NUM}r /tmp/billing_endpoints.txt" "$FILE"
    rm /tmp/billing_endpoints.txt
  fi
else
  echo "✅ /billing/success endpoint already exists"
fi

echo ""
echo "✅ Fixes applied!"
echo ""
echo "🔄 Next steps:"
echo "   1. Rebuild: pnpm -C apps/api build"
echo "   2. Restart service (or wait for auto-restart)"
echo ""
echo "Or run: pnpm -C apps/api build && pm2 restart sinna-api || supervisorctl restart sinna-api || systemctl restart sinna-api"

