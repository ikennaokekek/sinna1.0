# 🔐 GitHub Secrets Setup Guide

**Status:** ⚠️ **ACTION REQUIRED** - Credentials are currently hardcoded in CI workflow

This guide will help you move sensitive credentials from the CI workflow file to GitHub Secrets for better security.

---

## 🚨 Why This Is Important

Currently, your database and Redis credentials are **hardcoded in plain text** in `.github/workflows/ci.yaml`. This means:
- ❌ Anyone with repository access can see production credentials
- ❌ Credentials are stored in git history forever
- ❌ Cannot rotate credentials without breaking CI
- ❌ Security risk if repository is ever made public

**After setup:**
- ✅ Credentials stored securely in GitHub Secrets
- ✅ Only authorized users can view/manage secrets
- ✅ Easy to rotate credentials without code changes
- ✅ No credentials in code or git history

---

## 📋 Step-by-Step Setup

### Step 1: Access GitHub Secrets

1. Go to your repository: `https://github.com/ikennaokekek/sinna1.0`
2. Click **Settings** (top navigation bar)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** button

### Step 2: Add DATABASE_URL Secret

1. **Name:** `DATABASE_URL`
2. **Secret:** Paste this value:
   ```
   postgresql://sinna1_0_user:g8vB4HBdqjK3izSoG0ZJz7D4NyFbsjhz@dpg-d3htvb33fgac73a3ttj0-a.frankfurt-postgres.render.com/sinna1_0?sslmode=require
   ```
3. Click **Add secret**

### Step 3: Add REDIS_URL Secret

1. Click **New repository secret** again
2. **Name:** `REDIS_URL`
3. **Secret:** Paste this value:
   ```
   rediss://default:AWMYAAIncDFjZGEwYTJlMGJlMjU0YzkzYjdkYjZmYmNhYmViM2VlNnAxMjUzNjg@good-owl-25368.upstash.io:6379
   ```
4. Click **Add secret**

### Step 4: Verify Secrets Are Added

You should now see two secrets in the list:
- ✅ `DATABASE_URL`
- ✅ `REDIS_URL`

---

## ✅ Verification

After adding the secrets:

1. **CI Workflow Updated:** ✅ Already done - `.github/workflows/ci.yaml` now uses `${{ secrets.DATABASE_URL }}` and `${{ secrets.REDIS_URL }}`

2. **Test the CI:**
   - Push a commit to trigger CI
   - Check Actions tab to verify CI runs successfully
   - CI should be able to access secrets without errors

---

## 🔄 Next Steps: Rotate Credentials

**⚠️ IMPORTANT:** Since these credentials were exposed in git history, you should rotate them:

### For Database (Render Postgres):

1. Go to Render Dashboard → Your Postgres Database
2. Go to **Settings** → **Reset Password**
3. Generate a new password
4. Update the `DATABASE_URL` secret in GitHub with the new connection string
5. Update `DATABASE_URL` environment variable in all Render services

### For Redis (Upstash):

1. Go to Upstash Dashboard → Your Redis Database
2. Go to **Details** → **Reset Password** (or create new credentials)
3. Update the `REDIS_URL` secret in GitHub with the new connection string
4. Update `REDIS_URL` environment variable in all Render services

---

## 📝 Quick Reference

**GitHub Secrets Location:**
```
Repository → Settings → Secrets and variables → Actions
```

**Current Secrets Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**CI Workflow Usage:**
```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  REDIS_URL: ${{ secrets.REDIS_URL }}
```

---

## 🆘 Troubleshooting

### CI Fails with "Secret not found"
- Verify secrets are added in GitHub (Settings → Secrets → Actions)
- Check secret names match exactly: `DATABASE_URL` and `REDIS_URL` (case-sensitive)
- Ensure you're looking at the correct repository

### CI Fails with "Connection refused"
- Verify the connection strings are correct
- Check that database/Redis services are running
- Ensure credentials haven't been rotated (if so, update secrets)

### Can't see Secrets option
- You need **Admin** or **Maintain** permissions on the repository
- Contact repository owner to add secrets or grant permissions

---

## ✅ Completion Checklist

- [ ] Added `DATABASE_URL` secret to GitHub
- [ ] Added `REDIS_URL` secret to GitHub
- [ ] Verified CI workflow uses secrets (already done)
- [ ] Tested CI workflow runs successfully
- [ ] **ROTATED** database password (security best practice)
- [ ] **ROTATED** Redis password (security best practice)
- [ ] Updated Render services with new credentials

---

**Setup Date:** 2025-01-27  
**Status:** Ready for setup - Follow steps above

