#!/bin/bash
# Deploy to PRODUCTION (dealerwyze.com)
# Only run this when staging has been verified working

set -e

echo ""
echo "⚠️  PRODUCTION DEPLOY"
echo "This will push to dealerwyze.com (live dealers)"
echo ""
read -p "Have you tested on staging first? (yes/no): " confirmed

if [ "$confirmed" != "yes" ]; then
  echo "Deploy cancelled. Test on staging first:"
  echo "  ./deploy-staging.sh"
  exit 1
fi

echo ""
echo "🚀 Deploying to PRODUCTION (dealerwyze.com)..."

# Swap to production project
cp .vercel/project.json .vercel/project.staging.json
cp .vercel/project.prod.json .vercel/project.json

npx vercel --prod

# Restore staging as default
cp .vercel/project.staging.json .vercel/project.json

echo ""
echo "✅ Production deploy complete → https://dealerwyze.com"
echo "   Staging project restored as default"
