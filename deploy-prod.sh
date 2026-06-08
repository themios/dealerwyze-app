#!/bin/bash
# Deploy to PRODUCTION (dealerwyze.com + realtywyze.us)
# Branch: main
# Vercel Project: dealer-wyze
# DANGEROUS: Affects live users. Requires staging verification first.
# Usage: ./deploy-prod.sh

set -e

echo ""
echo "⚠️  PRODUCTION DEPLOY — LIVE USERS"
echo "=========================================="
echo "This will deploy to:"
echo "  • dealerwyze.com (dealers)"
echo "  • realtywyze.us (real estate agents)"
echo ""

# Verify we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: Must be on 'main' branch to deploy to production"
    echo "   Current branch: $CURRENT_BRANCH"
    echo ""
    echo "Switch to main:"
    echo "   git checkout main"
    echo "   git pull origin main"
    exit 1
fi

# Verify branch is clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes. Commit or stash them first."
    exit 1
fi

echo "✅ On main branch and clean"
echo ""

# Safety check: require explicit confirmation
read -p "Have you tested this on staging first? (yes/no): " staging_test
if [ "$staging_test" != "yes" ]; then
    echo ""
    echo "❌ Deploy cancelled. Test on staging first:"
    echo "   git checkout develop"
    echo "   ./deploy-staging.sh"
    exit 1
fi

echo ""
read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirmed
if [ "$confirmed" != "yes" ]; then
    echo "❌ Deploy cancelled"
    exit 1
fi

echo ""
echo "🚀 Deploying main to PRODUCTION..."
echo ""

npx vercel --prod 2>&1 || {
    echo ""
    echo "❌ Deployment failed!"
    echo "Check Vercel logs:"
    echo "   https://vercel.com/apollo-projects/dealer-wyze/deployments"
    exit 1
}

echo ""
echo "✅ Production deployment complete!"
echo ""
echo "🔗 Live domains:"
echo "   https://dealerwyze.com (dealers)"
echo "   https://realtywyze.us (real estate agents)"
echo ""
echo "View deployment:"
echo "   https://vercel.com/apollo-projects/dealer-wyze/deployments"
echo ""
echo "⚠️  Verify both domains are working correctly"
