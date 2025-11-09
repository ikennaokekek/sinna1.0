# 🔧 Step-by-Step Guide: Fix Billing Endpoints on Render Shell

This guide will help you manually update the code on Render to fix the `/billing/success` endpoint.

---

## 📋 What We're Fixing

The `/billing/success` endpoint is currently returning `{"code":"unauthorized"}` because:
1. The auth bypass doesn't include `/billing/success` and `/billing/cancel`
2. The billing endpoint routes don't exist in the deployed code

---

## 🚀 Step 1: Open Render Shell

1. Go to: https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg
2. Click the **"Shell"** button (or **"SSH"** link)
3. Wait for the shell to open

---

## 🔍 Step 2: Navigate to Project Directory

In the Render Shell, type:
```bash
cd /opt/render/project/src
```

Press Enter. You should now be in the project directory.

---

## 📝 Step 3: Open the File for Editing

Type:
```bash
nano apps/api/src/index.ts
```

Press Enter. This opens the file in the `nano` text editor.

---

## ✏️ Step 4: Fix #1 - Update Auth Bypass (Around Line 158-165)

### What to Look For:

You'll see something like this:
```typescript
app.addHook('preHandler', async (req, reply) => {
  // Allow public metrics/docs, demo endpoint, billing pages, and Stripe webhooks to bypass auth
  // Test endpoints now require admin authentication
  if (
    req.url === '/webhooks/stripe' ||
    req.url === '/metrics' ||
    req.url === '/v1/demo' ||
    req.url.startsWith('/api-docs')
  ) {
    return;
  }
```

### What to Change:

Find the line that says:
```typescript
    req.url.startsWith('/api-docs')
```

**Change it to:**
```typescript
    req.url.startsWith('/api-docs') ||
    req.url.startsWith('/billing/success') ||
    req.url.startsWith('/billing/cancel')
```

### How to Edit in Nano:

1. Use arrow keys to move your cursor to the line with `req.url.startsWith('/api-docs')`
2. Move to the end of that line (after the closing quote and parenthesis)
3. Press Enter to create a new line
4. Type: `    req.url.startsWith('/billing/success') ||`
5. Press Enter again
6. Type: `    req.url.startsWith('/billing/cancel')`

**It should look like this when done:**
```typescript
  if (
    req.url === '/webhooks/stripe' ||
    req.url === '/metrics' ||
    req.url === '/v1/demo' ||
    req.url.startsWith('/api-docs') ||
    req.url.startsWith('/billing/success') ||
    req.url.startsWith('/billing/cancel')
  ) {
```

---

## ✏️ Step 5: Fix #2 - Add Billing Endpoints (Around Line 627)

### What to Look For:

Scroll down (use arrow keys or Page Down) until you find:
```typescript
  // GET /v1/demo
  app.get('/v1/demo', {
    schema: {
      description: 'Demo endpoint to verify API is working',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            now: { type: 'string', format: 'date-time' }
      }
    }
    }
    }
  }, async () => ({ ok: true, now: new Date().toISOString() }));
```

### What to Add:

**Right after** the `/v1/demo` endpoint (after the closing `});`), add these two endpoints:

```typescript
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
```

### How to Add in Nano:

1. Find the line that says `}, async () => ({ ok: true, now: new Date().toISOString() }));`
2. Move your cursor to the end of that line
3. Press Enter twice to create blank lines
4. Copy and paste the entire code block above (or type it manually)
5. Make sure the indentation matches (use spaces, not tabs)

---

## 💾 Step 6: Save the File

1. Press `Ctrl + X` (this exits nano)
2. Press `Y` (this confirms you want to save)
3. Press `Enter` (this confirms the filename)

---

## 🔨 Step 7: Rebuild the API

Type:
```bash
pnpm -C apps/api build
```

Press Enter. Wait for it to finish (should take 30-60 seconds).

You should see output like:
```
> @sinna/api@0.0.1 build /opt/render/project/src/apps/api
> tsc -p tsconfig.json
```

If you see errors, let me know and I'll help fix them.

---

## 🔄 Step 8: Restart the Service

The service should auto-restart, but if it doesn't:

1. Go back to Render Dashboard
2. Click "Manual Deploy" → "Clear build cache & deploy"
3. Or the service might restart automatically

---

## ✅ Step 9: Test It

After the service restarts, test:
```bash
curl https://sinna.site/billing/success
```

You should see:
```json
{
  "success": true,
  "message": "Payment successful! 🎉",
  "session_id": null,
  "note": "Your API key is being generated..."
}
```

Instead of:
```json
{"code":"unauthorized"}
```

---

## 🆘 Troubleshooting

**If you make a mistake:**
- Press `Ctrl + X` and then `N` (don't save)
- Start over

**If the build fails:**
- Check for TypeScript errors in the output
- Make sure all brackets and parentheses are closed
- Verify the indentation is correct

**If you need help:**
- Copy the error message
- I can help you fix it!

---

## 📝 Quick Reference: What Each Fix Does

**Fix #1 (Auth Bypass):**
- Makes `/billing/success` and `/billing/cancel` public (no API key needed)
- This is why you're getting `{"code":"unauthorized"}` - the auth check is blocking it

**Fix #2 (Billing Endpoints):**
- Adds the actual `/billing/success` and `/billing/cancel` routes
- These routes return the success/cancel messages

Both fixes are needed for it to work!

