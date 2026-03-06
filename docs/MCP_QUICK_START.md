# MCP Quick Start Guide

**TL;DR:** Get these 4 keys, replace placeholders in `.cursor/mcp.json`, restart Cursor.

## 🎯 What You Need to Do

1. **Get 4 keys/tokens** (see detailed guide below)
2. **Edit `.cursor/mcp.json`** - replace placeholders
3. **Restart Cursor** (quit completely, reopen)
4. **Test** - ask AI: "List my Stripe customers"

---

## 📋 Keys You Need to Get

### 1. GitHub Personal Access Token
- **URL:** https://github.com/settings/tokens
- **Scopes:** `repo`, `read:org`, `workflow`
- **Replace:** `YOUR_GITHUB_PAT_HERE` in `.cursor/mcp.json`

### 2. Resend API Key
- **URL:** https://resend.com/api-keys
- **Replace:** `YOUR_RESEND_API_KEY_HERE` in `.cursor/mcp.json`

### 3. Upstash API Key + Email
- **URL:** https://console.upstash.com/account/api
- **Replace:** 
  - `YOUR_UPSTASH_EMAIL_HERE` → Your Upstash account email
  - `YOUR_UPSTASH_API_KEY_HERE` → API key from Upstash

### 4. Stripe & Sentry
- **No keys needed!** These use OAuth - Cursor will prompt you to log in on first use.

---

## ✅ Already Configured (No Action Needed)

- ✅ **Render** - Already set up with API key
- ✅ **Stripe** - OAuth (will prompt on first use)
- ✅ **Sentry** - OAuth (will prompt on first use)

---

## 📝 Step-by-Step

1. **Open `.cursor/mcp.json`** in your project root
2. **Get GitHub PAT:**
   - Go to https://github.com/settings/tokens
   - Generate new token (classic)
   - Scopes: `repo`, `read:org`, `workflow`
   - Copy token (`ghp_...`)
   - Replace `YOUR_GITHUB_PAT_HERE`

3. **Get Resend Key:**
   - Go to https://resend.com/api-keys
   - Create API key
   - Copy key (`re_...`)
   - Replace `YOUR_RESEND_API_KEY_HERE`

4. **Get Upstash Credentials:**
   - Go to https://console.upstash.com/account/api
   - Create API key
   - Copy API key and your email
   - Replace both placeholders

5. **Save `.cursor/mcp.json`**

6. **Restart Cursor** (quit completely, reopen)

7. **Test:**
   - Ask AI: "List my GitHub repositories"
   - Ask AI: "Show my Stripe customers" (will prompt OAuth first time)
   - Ask AI: "List my Sentry issues" (will prompt OAuth first time)

---

## 🔍 Verify Setup

After restarting Cursor:
- Go to **Cursor Settings** → **Tools & MCP**
- You should see all configured servers listed
- Green indicators = working
- Red indicators = check keys/config

---

## 📚 Full Documentation

- **Detailed Setup:** `docs/MCP_SETUP.md`
- **Keys Guide:** `docs/KEYS_AND_TOKENS_GUIDE.md`

---

## ⚠️ Troubleshooting

**MCP servers not showing?**
- Make sure you **completely quit** Cursor (not just close window)
- Check JSON syntax in `.cursor/mcp.json` (no trailing commas, valid JSON)

**GitHub MCP not working?**
- Check Docker is installed: `docker ps`
- If no Docker, GitHub MCP won't work (use GitHub CLI instead)

**OAuth not working?**
- Make sure Cursor version is 1.0+ (supports OAuth)
- Check internet connection

**Need help?** See `docs/MCP_SETUP.md` for detailed troubleshooting.
