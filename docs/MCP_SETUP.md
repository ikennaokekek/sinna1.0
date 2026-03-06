# MCP (Model Context Protocol) Setup Guide

This guide explains how to configure MCP servers in Cursor IDE to interact with external services directly from the AI agent.

## What is MCP?

Model Context Protocol (MCP) allows Cursor's AI agent to interact with external services through standardized APIs. Instead of just editing code, the AI can:
- Query Stripe for customer/subscription data
- Create GitHub issues and PRs
- Send emails via Resend
- Check Sentry errors
- Manage Redis databases on Upstash
- And more!

## Configuration File

MCP servers are configured in `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global).

**Important:** This file is already in `.gitignore` to prevent committing secrets. Replace all `YOUR_*_HERE` placeholders with your actual keys/tokens.

## Configured Services

### ✅ Render (Already Configured)
- **Status:** Already set up with API key
- **What it does:** Manage Render services, view logs, update env vars, query databases
- **No action needed** - already working!

### 🔧 Stripe
- **Type:** Remote OAuth (recommended) or Local with API key
- **Current config:** Remote OAuth (`https://mcp.stripe.com`)
- **Setup:** On first use, Cursor will open Stripe OAuth login
- **Alternative (local):** If you prefer API key, replace with:
  ```json
  "stripe": {
    "command": "npx",
    "args": ["-y", "@stripe/mcp@latest"],
    "env": {
      "STRIPE_SECRET_KEY": "sk_test_..."
    }
  }
  ```

### 🔧 GitHub
- **Type:** Docker-based MCP server
- **Requires:** Docker installed and running
- **Setup:** 
  1. Create GitHub Personal Access Token (see keys list below)
  2. Replace `YOUR_GITHUB_PAT_HERE` in `.cursor/mcp.json`
- **What it does:** Manage repos, create issues/PRs, view CI/CD status

### 🔧 Resend
- **Type:** Local npm package
- **Setup:**
  1. Get Resend API key from https://resend.com/api-keys
  2. Replace `YOUR_RESEND_API_KEY_HERE` in `.cursor/mcp.json`
- **What it does:** Send emails, manage domains, view email stats

### 🔧 Sentry
- **Type:** Remote OAuth
- **Current config:** Remote OAuth (`https://mcp.sentry.dev/mcp`)
- **Setup:** On first use, Cursor will open Sentry OAuth login
- **What it does:** Query errors, analyze stack traces, view performance data

### 🔧 Upstash (Redis)
- **Type:** Local npm package
- **Setup:**
  1. Get Upstash API key from https://console.upstash.com/account/api
  2. Replace `YOUR_UPSTASH_EMAIL_HERE` and `YOUR_UPSTASH_API_KEY_HERE` in `.cursor/mcp.json`
- **What it does:** Manage Redis databases, execute commands, view metrics

## After Configuration

1. **Replace all placeholders** in `.cursor/mcp.json` with your actual keys/tokens
2. **Restart Cursor completely** (quit and reopen) - MCP servers only load at startup
3. **Test each service** by asking the AI:
   - "List my Stripe customers"
   - "Show my GitHub repositories"
   - "List my Sentry issues"
   - "Show my Upstash databases"

## Troubleshooting

### GitHub MCP not working
- **Check:** Docker is installed and running (`docker ps`)
- **Alternative:** Use GitHub CLI (`gh`) for basic operations

### Stripe/Sentry OAuth not working
- **Check:** Cursor version is 1.0+ (supports OAuth)
- **Fallback:** Use local config with API keys instead

### MCP servers not appearing
- **Check:** Restarted Cursor completely (not just reload window)
- **Check:** Cursor Settings → Tools & MCP shows configured servers
- **Check:** No JSON syntax errors in `mcp.json`

## Security Notes

- ✅ `.cursor/mcp.json` is in `.gitignore` - won't be committed
- ⚠️ Never commit real API keys/tokens to git
- ⚠️ Use OAuth where possible (Stripe, Sentry) - more secure than API keys
- ⚠️ Use restricted API keys (Stripe) with minimal permissions

## Additional Services (CLI Only)

These services don't have MCP servers but can be used via CLI:

- **AssemblyAI:** Use API directly or via `curl` / SDK
- **OpenAI:** Use `openai` CLI or API directly
- **Cloudflare R2:** Use `wrangler` CLI
- **SendGrid:** Use API directly or community MCP (optional)

See `KEYS_AND_TOKENS_GUIDE.md` for CLI setup instructions.
