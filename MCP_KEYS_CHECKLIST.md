# 🔑 MCP Keys & Tokens Checklist

**Status:** ✅ MCP configuration files created  
**Next Step:** Get these keys and replace placeholders in `.cursor/mcp.json`

---

## ✅ Required Keys (4 total)

### 1. GitHub Personal Access Token
- [ ] **Get it:** https://github.com/settings/tokens
- [ ] **Steps:**
  1. Click "Generate new token" → "Generate new token (classic)"
  2. Name: `Cursor MCP - SINNA`
  3. Expiration: Your choice (90 days, 1 year, or no expiration)
  4. **Select scopes:**
     - ✅ `repo` (Full control of private repositories)
     - ✅ `read:org` (Read org and team membership)
     - ✅ `workflow` (Update GitHub Action workflows)
  5. Click "Generate token"
  6. **Copy token** (starts with `ghp_...`) - you won't see it again!
- [ ] **Replace in `.cursor/mcp.json`:** `YOUR_GITHUB_PAT_HERE`

---

### 2. Resend API Key
- [ ] **Get it:** https://resend.com/api-keys
- [ ] **Steps:**
  1. Sign up or log in to Resend
  2. Click "Create API Key"
  3. Name: `Cursor MCP - SINNA`
  4. Permission: "Full Access" (or "Sending Access")
  5. Click "Add"
  6. **Copy API key** (starts with `re_...`)
- [ ] **Replace in `.cursor/mcp.json`:** `YOUR_RESEND_API_KEY_HERE`
- [ ] **Note:** If already using Resend for SINNA, you can reuse the same key from Render env vars

---

### 3. Upstash API Key + Email
- [ ] **Get it:** https://console.upstash.com/account/api
- [ ] **Steps:**
  1. Sign up or log in to Upstash
  2. Go to Account → Management API
  3. Click "Create API Key"
  4. Name: `Cursor MCP - SINNA`
  5. **Copy API Key** (long alphanumeric string)
  6. **Note your email** (the email you used to sign up)
- [ ] **Replace in `.cursor/mcp.json`:**
  - `YOUR_UPSTASH_EMAIL_HERE` → Your Upstash account email
  - `YOUR_UPSTASH_API_KEY_HERE` → The API key you just created
- [ ] **Note:** If already using Upstash Redis for SINNA, use the same account

---

### 4. Stripe & Sentry (OAuth - No Keys Needed!)
- [ ] **Stripe:** Will prompt for OAuth login on first use (no key needed)
- [ ] **Sentry:** Will prompt for OAuth login on first use (no key needed)
- [ ] **Action:** Just use the services - Cursor will handle OAuth automatically

---

## ✅ Already Configured (No Action Needed)

- ✅ **Render** - Already set up with API key in `.cursor/mcp.json`
- ✅ **Stripe** - OAuth configured (will prompt on first use)
- ✅ **Sentry** - OAuth configured (will prompt on first use)

---

## 📝 After Getting All Keys

1. **Open `.cursor/mcp.json`** in your project root
2. **Replace all placeholders:**
   - `YOUR_GITHUB_PAT_HERE` → Your GitHub PAT
   - `YOUR_RESEND_API_KEY_HERE` → Your Resend API key
   - `YOUR_UPSTASH_EMAIL_HERE` → Your Upstash email
   - `YOUR_UPSTASH_API_KEY_HERE` → Your Upstash API key
3. **Save the file**
4. **Restart Cursor completely** (quit and reopen - MCP servers only load at startup)
5. **Test:** Ask AI "List my GitHub repositories" or "Show my Stripe customers"

---

## 🔍 Verify Setup

After restarting Cursor:
- Go to **Cursor Settings** → **Tools & MCP**
- You should see:
  - ✅ Render (green)
  - ✅ Stripe (green after OAuth)
  - ✅ GitHub (green after adding PAT)
  - ✅ Resend (green after adding key)
  - ✅ Sentry (green after OAuth)
  - ✅ Upstash (green after adding credentials)

---

## 📚 Documentation

- **Quick Start:** `docs/MCP_QUICK_START.md`
- **Detailed Setup:** `docs/MCP_SETUP.md`
- **Full Keys Guide:** `docs/KEYS_AND_TOKENS_GUIDE.md`

---

## ⚠️ Important Notes

- ✅ `.cursor/mcp.json` is already in `.gitignore` - won't be committed
- ⚠️ Never commit real API keys to git
- ⚠️ Keep keys secret - if exposed, revoke immediately
- ⚠️ Use OAuth where possible (Stripe, Sentry) - more secure

---

## 🆘 Troubleshooting

**MCP servers not showing after restart?**
- Check JSON syntax in `.cursor/mcp.json` (use JSON validator)
- Make sure you **completely quit** Cursor (not just close window)
- Check Cursor Settings → Tools & MCP for server status

**GitHub MCP not working?**
- Check Docker is installed: `docker ps` in terminal
- If Docker not installed, GitHub MCP won't work (use GitHub CLI `gh` instead)

**OAuth not working?**
- Make sure Cursor version is 1.0+ (supports OAuth)
- Check internet connection
- Try using local config with API keys instead (see `docs/MCP_SETUP.md`)

---

**Ready?** Start with GitHub PAT (easiest), then Resend, then Upstash. Stripe and Sentry will handle themselves via OAuth!
