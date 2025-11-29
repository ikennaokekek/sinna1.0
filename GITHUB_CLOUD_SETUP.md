# GitHub Cloud Setup Guide - Cursor Cloud Mode

## 📋 Pre-Flight Checklist

Before starting, ensure you have:
- [ ] GitHub account created
- [ ] GitHub Personal Access Token (if using HTTPS)
- [ ] SSH key set up (if using SSH)
- [ ] Cursor installed and updated

## 🔍 Step 1: Check Git Status

First, check if git is already initialized:

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
git status
```

**If you see:** "fatal: not a git repository" → Proceed to Step 2
**If you see:** Git status output → Skip to Step 3

## 🚀 Step 2: Initialize Git Repository

**Only run these if git is NOT initialized:**

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Initialize git repository
git init

# Stage all files
git add .

# Create initial commit
git commit -m "Initial cloud commit: Sinna 1.0 API and Widget System"

# Set main branch
git branch -M main
```

## 📦 Step 3: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `SINNA1.0` (or your preferred name)
3. Description: "Sinna 1.0 - Advanced Accessibility Features API for Streaming Platforms"
4. Choose: **Private** (recommended) or **Public**
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **"Create repository"**

## 🔗 Step 4: Add Remote and Push

After creating the repo, GitHub will show you a URL. Copy it and use one of these:

### Option A: HTTPS (Easier, requires token)
```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Replace YOUR_USERNAME and YOUR_REPO_NAME with your actual values
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git push -u origin main
```

**If prompted for credentials:**
- Username: Your GitHub username
- Password: Use a **Personal Access Token** (not your password)
  - Create token: https://github.com/settings/tokens
  - Select scopes: `repo` (full control)

### Option B: SSH (Recommended, requires SSH key)
```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Replace YOUR_USERNAME and YOUR_REPO_NAME with your actual values
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git push -u origin main
```

## ☁️ Step 5: Open in Cursor Cloud Mode

### Method 1: From Cursor (Recommended)

1. **Open Cursor**
2. **File → Open → Clone GitHub Repo**
   - Or use shortcut: `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows)
   - Type: "Clone GitHub Repo"
3. **Enter your repository URL:**
   ```
   https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```
   Or:
   ```
   git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
   ```
4. **Choose location:** Select a folder (or let Cursor choose)
5. **IMPORTANT:** When prompted, select **"Open in Cloud Workspace"**
   - This ensures Cursor works fully in cloud mode
   - All files will be synced to cloud
   - No local files will be used

### Method 2: From GitHub Website

1. Go to your repository on GitHub
2. Click the green **"Code"** button
3. Copy the repository URL
4. In Cursor: **File → Open → Clone GitHub Repo**
5. Paste the URL
6. Select **"Open in Cloud Workspace"**

## ✅ Step 6: Verify Cloud Mode

After opening in Cursor Cloud:

1. **Check workspace indicator:**
   - Look for "Cloud" or "☁️" icon in Cursor status bar
   - Should show "Cloud Workspace" or similar

2. **Verify files are synced:**
   - Open a file (e.g., `package.json`)
   - Make a small change
   - Save (`Cmd+S` / `Ctrl+S`)
   - Check if change syncs (should see sync indicator)

3. **Test terminal:**
   - Open terminal in Cursor (`Ctrl+`` or View → Terminal)
   - Run: `pwd` - Should show cloud workspace path
   - Run: `ls` - Should show your project files

## 🔒 Important: Cloud Mode Settings

To ensure Cursor works **fully in cloud mode**:

1. **Settings → Workspace:**
   - Enable "Cloud Sync"
   - Enable "Auto-save"
   - Disable "Local File Cache" (if option exists)

2. **Settings → Git:**
   - Ensure "Git: Enabled" is checked
   - "Git: Auto Fetch" should be enabled

3. **Verify remote:**
   ```bash
   git remote -v
   ```
   Should show your GitHub repository URL

## 📝 Complete Command Sequence

Here's the complete sequence if starting from scratch:

```bash
# Navigate to project
cd /Users/ikennaokeke/Documents/SINNA1.0

# Check if git exists
git status || git init

# Stage all files
git add .

# Commit
git commit -m "Initial cloud commit: Sinna 1.0 API and Widget System"

# Set main branch
git branch -M main

# Add remote (replace with your actual repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git push -u origin main
```

## 🎯 Confirmation Checklist

After completing all steps, verify:

- [ ] **Git initialized** - `git status` shows clean working tree
- [ ] **Repo created** - Repository visible on GitHub
- [ ] **Remote added** - `git remote -v` shows your GitHub URL
- [ ] **Code pushed** - Files visible on GitHub repository page
- [ ] **Cursor cloud workspace created** - Cursor shows "Cloud Workspace" indicator
- [ ] **Files accessible** - Can open and edit files in Cursor
- [ ] **Changes sync** - Edits save and sync to cloud
- [ ] **Git works** - Can commit and push from Cursor

## 🚨 Troubleshooting

### "Repository not found" error
- Check repository URL is correct
- Verify repository exists on GitHub
- Check if repository is private and you have access

### "Permission denied" error
- For HTTPS: Use Personal Access Token instead of password
- For SSH: Ensure SSH key is added to GitHub account
- Check: https://github.com/settings/keys

### "Remote already exists" error
```bash
git remote remove origin
git remote add origin YOUR_NEW_URL
```

### Cursor not showing Cloud Workspace option
- Update Cursor to latest version
- Check Cursor Cloud subscription/plan
- Try: File → Open → Open Folder → Select repo → Check "Cloud" option

### Files not syncing
- Check internet connection
- Verify Cursor Cloud is enabled in settings
- Try: File → Reload Window

## 📚 Additional Resources

- GitHub Docs: https://docs.github.com/en/get-started
- Cursor Cloud Docs: Check Cursor documentation
- Git Basics: https://git-scm.com/doc

## ✨ Next Steps After Setup

1. **Set up GitHub Secrets** (if using CI/CD):
   - Go to repository → Settings → Secrets
   - Add `DATABASE_URL`, `REDIS_URL`, etc.

2. **Configure GitHub Actions** (if needed):
   - Your CI workflow is already in `.github/workflows/ci.yaml`

3. **Set up branch protection** (optional):
   - Repository → Settings → Branches
   - Protect `main` branch

4. **Add collaborators** (if needed):
   - Repository → Settings → Collaborators

---

**Your project is now cloud-synced and ready for Cursor Cloud Mode! 🎉**

