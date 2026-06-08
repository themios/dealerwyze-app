#!/bin/bash
# Deploy to STAGING (staging.dealerwyze.com)
# Branch: develop
# Vercel Project: dealer-wyze-staging
# Usage: ./deploy-staging.sh

set -e

echo ""
echo "🚀 Deploying to STAGING (develop branch)..."
echo ""

# Verify we're on develop branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "❌ Error: Must be on 'develop' branch to deploy to staging"
    echo "   Current branch: $CURRENT_BRANCH"
    echo ""
    echo "Switch to develop:"
    echo "   git checkout develop"
    exit 1
fi

# Verify branch is clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes. Commit or stash them first."
    exit 1
fi

echo "✅ On develop branch and clean"
echo ""

# Swap to staging Vercel project
if [ -f ".vercel/project.staging.json" ]; then
    cp .vercel/project.json .vercel/project.prod.json 2>/dev/null || true
    cp .vercel/project.staging.json .vercel/project.json
    echo "📝 Using staging Vercel project"
else
    echo "⚠️  .vercel/project.staging.json not found (using current project)"
fi

echo ""
echo "📤 Deploying develop to staging.dealerwyze.com..."
npx vercel 2>&1 || {
    echo ""
    echo "❌ Deployment failed. Check Vercel logs:"
    echo "   https://vercel.com/apollo-projects/dealer-wyze-staging"
    exit 1
}

# Restore production as default
if [ -f ".vercel/project.prod.json" ]; then
    cp .vercel/project.prod.json .vercel/project.json
fi

echo ""
echo "✅ Staging deployment complete!"
echo ""
echo "🔗 Staging URL:"
echo "   https://staging.dealerwyze.com"
echo ""
echo "View deployments:"
echo "   https://vercel.com/apollo-projects/dealer-wyze-staging/deployments"
