# Keys and Tokens Setup Guide

This guide walks you through getting all the API keys, tokens, and credentials needed to configure MCP servers and CLI tools for SINNA.

## Quick Checklist

- [ ] GitHub Personal Access Token
- [ ] Resend API Key
- [ ] Upstash API Key + Email
- [ ] Stripe Secret Key (optional - if not using OAuth)
- [ ] Sentry DSN (already in project, but verify)
- [ ] AssemblyAI API Key (already in project, but verify)
- [ ] OpenAI API Key (already in project, but verify)

---

## 1. GitHub Personal Access Token (Required for GitHub MCP)

**What it's for:** GitHub MCP server to manage repos, issues, PRs from Cursor

**Steps:**
1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. **Name:** `Cursor MCP - SINNA`
4. **Expiration:** Choose your preference (90 days, 1 year, or no expiration)
5. **Select scopes:**
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (Read org and team membership)
   - ✅ `workflow` (Update GitHub Action workflows)
6. Click **"Generate token"**
7. **Copy the token immediately** (starts with `ghp_...`) - you won't see it again!
8. Replace `YOUR_GITHUB_PAT_HERE` in `.cursor/mcp.json`

**Security:** Keep this token secret. If exposed, revoke it immediately and create a new one.

---

## 2. Resend API Key (Required for Resend MCP)

**What it's for:** Resend MCP server to send emails, manage domains from Cursor

**Steps:**
1. Go to: https://resend.com/api-keys
2. Sign up or log in to Resend
3. Click **"Create API Key"**
4. **Name:** `Cursor MCP - SINNA`
5. **Permission:** Select **"Full Access"** (or "Sending Access" if you prefer)
6. Click **"Add"**
7. **Copy the API key** (starts with `re_...`)
8. Replace `YOUR_RESEND_API_KEY_HERE` in `.cursor/mcp.json`

**Note:** If you're already using Resend for SINNA (check Render env vars), you can reuse the same key.

**Domain Verification:** Make sure `sinna.site` is verified in Resend dashboard if you're sending from that domain.

---

## 3. Upstash API Key + Email (Required for Upstash MCP)

**What it's for:** Upstash MCP server to manage Redis databases, execute commands from Cursor

**Steps:**
1. Go to: https://console.upstash.com/account/api
2. Sign up or log in to Upstash
3. Scroll to **"Management API"** section
4. Click **"Create API Key"**
5. **Name:** `Cursor MCP - SINNA`
6. **Copy the API Key** (long alphanumeric string)
7. **Note your email** (the email you used to sign up)
8. Replace in `.cursor/mcp.json`:
   - `YOUR_UPSTASH_EMAIL_HERE` → Your Upstash account email
   - `YOUR_UPSTASH_API_KEY_HERE` → The API key you just created

**Note:** If you're already using Upstash Redis for SINNA (check `REDIS_URL` in Render), you can use the same account.

---

## 4. Stripe Secret Key (Optional - Only if NOT using OAuth)

**What it's for:** Stripe MCP server (local mode) - only needed if you prefer API key over OAuth

**Current config:** Using OAuth (remote) - **no key needed!** Cursor will prompt for Stripe login on first use.

**If you want to switch to local mode:**
1. Go to: https://dashboard.stripe.com/apikeys
2. **For testing:** Use **"Test mode"** key (starts with `sk_test_...`)
3. **For production:** Use **"Live mode"** key (starts with `sk_live_...`)
4. Copy the key
5. Update `.cursor/mcp.json` to use local config (see `MCP_SETUP.md`)

**Recommendation:** Stick with OAuth (current config) - more secure and no key management needed.

---

## 5. Sentry DSN (Already Configured - Verify)

**What it's for:** Sentry error tracking (already in project)

**Current status:** Already configured in Render environment variables

**To verify/get new DSN:**
1. Go to: https://sentry.io/settings/
2. Select your SINNA project (or create one)
3. Go to **Settings** → **Projects** → **Your Project** → **Client Keys (DSN)**
4. Copy the DSN (format: `https://...@sentry.io/...`)
5. Verify it matches `SENTRY_DSN` in Render environment variables

**MCP:** Sentry MCP uses OAuth - no DSN needed for MCP. DSN is only for the app itself.

---

## 6. AssemblyAI API Key (Already Configured - Verify)

**What it's for:** Speech-to-text transcription (already in project)

**Current status:** Already configured in Render Worker service environment variables

**To verify/get new key:**
1. Go to: https://www.assemblyai.com/app/account
2. Sign up or log in
3. Go to **API Keys** section
4. Copy your API key
5. Verify it matches `ASSEMBLYAI_API_KEY` in Render Worker service environment variables

**MCP:** No MCP server available - use API directly or via SDK in code.

---

## 7. OpenAI API Key (Already Configured - Verify)

**What it's for:** TTS (text-to-speech) and Whisper transcription (already in project)

**Current status:** Already configured in Render environment variables

**To verify/get new key:**
1. Go to: https://platform.openai.com/api-keys
2. Sign up or log in
3. Click **"Create new secret key"**
4. **Name:** `SINNA Production`
5. Copy the key (starts with `sk-...`) - you won't see it again!
6. Verify it matches `OPENAI_API_KEY` in Render environment variables

**MCP:** No MCP server available - use API directly or via SDK in code.

**CLI Alternative:** Install OpenAI CLI: `npm install -g openai-cli` or use `curl` to API.

---

## 8. Cloudflare R2 Credentials (Already Configured - Verify)

**What it's for:** Object storage for video artifacts (already in project)

**Current status:** Already configured in Render environment variables

**To verify/get new credentials:**
1. Go to: https://dash.cloudflare.com/
2. Select your account
3. Go to **R2** → **Manage R2 API Tokens**
4. Click **"Create API Token"**
5. **Permissions:** Read & Write
6. **TTL:** Set expiration or leave blank
7. Copy:
   - **Account ID** → `R2_ACCOUNT_ID`
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
8. Verify these match Render environment variables

**MCP:** No MCP server available - use `wrangler` CLI or API directly.

**CLI:** Install Wrangler: `npm install -g wrangler` then `wrangler login`

---

## 9. SendGrid API Key (Optional - Alternative to Resend)

**What it's for:** Email sending (alternative to Resend)

**If you prefer SendGrid over Resend:**
1. Go to: https://app.sendgrid.com/settings/api_keys
2. Click **"Create API Key"**
3. **Name:** `Cursor MCP - SINNA`
4. **Permission:** Select **"Full Access"** or **"Mail Send"**
5. Copy the API key (starts with `SG....`)
6. Add to Render environment variables as `SENDGRID_API_KEY`

**MCP:** Community MCP available (garoth/sendgrid-mcp) - see `MCP_SETUP.md` for config.

---

## Summary: What to Replace in `.cursor/mcp.json`

After getting all keys, replace these placeholders:

| Placeholder | Replace With | Where to Get |
|------------|--------------|--------------|
| `YOUR_GITHUB_PAT_HERE` | GitHub PAT (`ghp_...`) | https://github.com/settings/tokens |
| `YOUR_RESEND_API_KEY_HERE` | Resend API Key (`re_...`) | https://resend.com/api-keys |
| `YOUR_UPSTASH_EMAIL_HERE` | Your Upstash email | Your Upstash account email |
| `YOUR_UPSTASH_API_KEY_HERE` | Upstash API Key | https://console.upstash.com/account/api |

**OAuth Services (No Keys Needed):**
- ✅ Stripe - Will prompt for OAuth login on first use
- ✅ Sentry - Will prompt for OAuth login on first use

---

## Next Steps

1. **Get all keys** using the steps above
2. **Replace placeholders** in `.cursor/mcp.json`
3. **Restart Cursor completely** (quit and reopen)
4. **Test each service** by asking the AI:
   - "List my Stripe customers"
   - "Show my GitHub repositories"
   - "List my Sentry issues"
   - "Show my Upstash databases"

---

## Security Reminders

- ✅ `.cursor/mcp.json` is already in `.gitignore` - won't be committed
- ⚠️ Never share API keys publicly
- ⚠️ Use OAuth where possible (Stripe, Sentry) - more secure
- ⚠️ Rotate keys periodically (every 90 days recommended)
- ⚠️ Revoke keys immediately if exposed

---

## Need Help?

- **MCP Setup:** See `docs/MCP_SETUP.md`
- **Render Environment:** Check Render dashboard → Your Service → Environment
- **Service Issues:** Check Cursor Settings → Tools & MCP for server status
