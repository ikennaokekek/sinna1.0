# Quick GitHub Setup - Step by Step Commands

## 🔍 Step 1: Check Current Status

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
git status
```

**If you see:** "fatal: not a git repository" → **Run Step 2**
**If you see:** Git status output → **Skip to Step 3**

---

## 🚀 Step 2: Initialize Git (Only if needed)

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0
git init
git add .
git commit -m "Initial cloud commit: Sinna 1.0 API and Widget System"
git branch -M main
```

---

## 📦 Step 3: Create GitHub Repository

1. Go to: **https://github.com/new**
2. Repository name: `SINNA1.0`
3. Choose: **Private** (recommended)
4. **DO NOT** check "Initialize with README"
5. Click **"Create repository"**

---

## 🔗 Step 4: Add Remote and Push

**After creating repo, GitHub shows you a URL. Copy it and run:**

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Replace YOUR_URL with the URL GitHub gave you
git remote add origin YOUR_URL

# Push to GitHub
git push -u origin main
```

**Example URLs:**
- HTTPS: `https://github.com/yourusername/SINNA1.0.git`
- SSH: `git@github.com:yourusername/SINNA1.0.git`

**If asked for credentials:**
- Username: Your GitHub username
- Password: Use **Personal Access Token** (create at https://github.com/settings/tokens)

---

## ☁️ Step 5: Open in Cursor Cloud Mode

### In Cursor:

1. **File → Open → Clone GitHub Repo**
2. **Paste your repository URL:**
   ```
   https://github.com/YOUR_USERNAME/SINNA1.0.git
   ```
3. **When prompted, select: "Open in Cloud Workspace"**
   - ⚠️ **CRITICAL:** Choose "Cloud Workspace" NOT "Local Folder"
   - This ensures Cursor works fully in cloud mode
   - All files will be synced to cloud
   - No local files will be used

---

## ✅ Confirmation Checklist

After completing all steps:

- [ ] Git initialized (`git status` works)
- [ ] Repo created (visible on GitHub)
- [ ] Remote added (`git remote -v` shows your URL)
- [ ] Code pushed (files visible on GitHub)
- [ ] Cursor cloud workspace created (shows "Cloud" indicator)
- [ ] Files accessible (can open files in Cursor)
- [ ] Changes sync (edits save to cloud)

---

## 🎯 All Commands in One Block

**Copy and paste this entire block (replace YOUR_URL):**

```bash
cd /Users/ikennaokeke/Documents/SINNA1.0

# Initialize git (if needed)
git init
git add .
git commit -m "Initial cloud commit: Sinna 1.0 API and Widget System"
git branch -M main

# Add remote (replace YOUR_URL with your GitHub repo URL)
git remote add origin YOUR_URL

# Push to GitHub
git push -u origin main
```

---

**After pushing, open Cursor and use File → Open → Clone GitHub Repo → Select "Open in Cloud Workspace"**

