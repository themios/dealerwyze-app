#!/bin/bash
# Deploy to STAGING (apollo-crm.vercel.app)
# This is the default deploy — test all changes here first

set -e

echo "🚀 Deploying to STAGING (apollo-crm.vercel.app)..."

# Ensure we're using the staging project
cp .vercel/project.staging.json .vercel/project.json

npx vercel --prod

echo "✅ Staging deploy complete → dealer-wyze-themio-5359-apollo-projects.vercel.app"
