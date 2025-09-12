#!/bin/bash

# 🚀 Sinna API - GitHub Setup Script
# Run this script to push your code to GitHub

echo "🚀 Setting up Sinna API on GitHub..."
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git not initialized. Run 'git init' first."
    exit 1
fi

# Get GitHub username
echo "📝 Enter your GitHub username:"
read -r GITHUB_USERNAME

if [ -z "$GITHUB_USERNAME" ]; then
    echo "❌ GitHub username is required"
    exit 1
fi

# Set up remote
echo "🔗 Setting up GitHub remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GITHUB_USERNAME/sinna-api.git"

echo "📤 Pushing to GitHub..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🔗 Repository: https://github.com/$GITHUB_USERNAME/sinna-api"
    echo ""
    echo "🎯 Next steps:"
    echo "1. Go to https://dashboard.render.com"
    echo "2. Click 'New +' → 'Blueprint'"
    echo "3. Connect your GitHub repository: $GITHUB_USERNAME/sinna-api"
    echo "4. Add environment variables from env.example"
    echo "5. Deploy!"
    echo ""
    echo "📖 Full instructions: ./deploy-instructions.md"
else
    echo ""
    echo "❌ Failed to push to GitHub"
    echo "Make sure you:"
    echo "1. Created the repository 'sinna-api' on GitHub"
    echo "2. Have push access to the repository"
    echo "3. Are authenticated with GitHub"
fi
