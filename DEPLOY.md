# Deployment Guide

**Updated:** 2026-06-08  
**Structure:** Two-environment deployment (staging → production)

---

## Quick Start

### Deploy to Staging
```bash
git checkout develop
./deploy-staging.sh
```
**Result:** Deploys to `staging.dealerwyze.com` for QA testing

### Deploy to Production
```bash
git checkout main
./deploy-prod.sh
```
**Result:** Deploys to `dealerwyze.com` + `realtywyze.us` (LIVE USERS)

---

## Environments

### Staging (dealer-wyze-staging)
- **Branch:** `develop`
- **Domain:** https://staging.dealerwyze.com
- **Purpose:** Test all changes before production
- **Data:** Staging database (safe for testing)
- **Deploy Command:** `./deploy-staging.sh`
- **Auto-deploy:** On push to develop (if Vercel webhook enabled)

### Production (dealer-wyze)
- **Branch:** `main`
- **Domains:** 
  - https://dealerwyze.com (dealer vertical)
  - https://realtywyze.us (real estate vertical)
- **Purpose:** Live application (real users, real data)
- **Data:** Production database (LIVE)
- **Deploy Command:** `./deploy-prod.sh`
- **Auto-deploy:** On push to main (Vercel webhook enabled)

---

## Workflow

### For New Features

```bash
# 1. Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/your-feature

# 2. Make changes and test locally
npm run dev
# Test your changes at http://localhost:3000
npm test
npm run build

# 3. Commit changes
git add .
git commit -m "feat: describe your change"

# 4. Push to GitHub
git push origin feature/your-feature

# 5. Open PR on GitHub
# → Request review
# → Get approval

# 6. Merge to develop (staging)
# On GitHub: Merge PR to develop
# GitHub auto-deploys to staging.dealerwyze.com via webhook

# 7. Test on staging
# Visit https://staging.dealerwyze.com
# Verify feature works on both verticals

# 8. Create PR: develop → main (production)
# On GitHub: Open PR from develop to main
# Request final review

# 9. Merge to main (production)
# On GitHub: Merge PR to main
# GitHub auto-deploys to dealerwyze.com + realtywyze.us via webhook

# 10. Verify production
curl -I https://dealerwyze.com          # Should be HTTP 200
curl -I https://realtywyze.us           # Should be HTTP 200
```

### Manual Deployment (If Auto-Deploy Fails)

```bash
# Staging
git checkout develop
git pull origin develop
./deploy-staging.sh

# Production
git checkout main
git pull origin main
./deploy-prod.sh
```

---

## Deploy Scripts

### deploy-staging.sh

**What it does:**
1. Verifies you're on `develop` branch
2. Checks for uncommitted changes
3. Swaps to staging Vercel project configuration
4. Runs `vercel` (preview deploy)
5. Restores production project configuration

**Usage:**
```bash
./deploy-staging.sh
```

**Output:**
```
✅ Staging deployment complete!
🔗 Staging URL: https://staging.dealerwyze.com
```

**When to use:**
- Testing features before production
- Hot-fixing issues discovered in staging
- Verifying changes across both verticals

---

### deploy-prod.sh

**What it does:**
1. Verifies you're on `main` branch
2. Checks for uncommitted changes
3. Asks: "Have you tested on staging?"
4. Asks: "Are you sure?" (safety confirmation)
5. Runs `vercel --prod` (production deploy)
6. Outputs links to verify both domains

**Usage:**
```bash
./deploy-prod.sh
```

**Prompts:**
```
⚠️  PRODUCTION DEPLOY — LIVE USERS
Have you tested this on staging first? (yes/no): yes
Are you sure you want to deploy to PRODUCTION? (yes/no): yes
```

**Output:**
```
✅ Production deployment complete!
🔗 Live domains:
   https://dealerwyze.com (dealers)
   https://realtywyze.us (real estate agents)
```

**When to use:**
- After staging verification passed
- After code review approved
- Only when you're confident in the changes

---

## Vercel Projects

### dealer-wyze (Production)
- **Vercel:** https://vercel.com/apollo-projects/dealer-wyze
- **GitHub:** themios/dealerwyze-app / main
- **Domains:** dealerwyze.com, realtywyze.us
- **Environment:** Production (live data)
- **Deploy:** `./deploy-prod.sh` or auto-webhook

### dealer-wyze-staging (Staging)
- **Vercel:** https://vercel.com/apollo-projects/dealer-wyze-staging
- **GitHub:** themios/dealerwyze-app / develop
- **Domain:** staging.dealerwyze.com
- **Environment:** Staging (test data)
- **Deploy:** `./deploy-staging.sh` or auto-webhook

---

## Troubleshooting

### Deploy Fails with "Must be on develop/main branch"

```bash
# Check current branch
git branch

# Switch to correct branch
git checkout develop    # For staging
# OR
git checkout main       # For production

# Pull latest
git pull origin develop
# OR
git pull origin main
```

### "You have uncommitted changes"

```bash
# Commit your changes
git add .
git commit -m "feat: your change"

# OR stash if you don't want to commit yet
git stash
```

### Vercel Deploy Fails

1. Check Vercel logs:
   - Staging: https://vercel.com/apollo-projects/dealer-wyze-staging/deployments
   - Production: https://vercel.com/apollo-projects/dealer-wyze/deployments

2. Common issues:
   - Build errors: Check `npm run build` locally first
   - Missing env vars: Check Vercel project settings
   - Large files: Check file sizes (>50MB needs Git LFS)

### Need to Rollback Production

```bash
# Go to Vercel dashboard
https://vercel.com/apollo-projects/dealer-wyze/deployments

# Find previous successful deployment
# Click "Promote to Production"
# This rolls back without needing to modify code
```

---

## Best Practices

1. **Always test locally first**
   ```bash
   npm run dev      # Visual testing
   npm test         # Unit tests
   npm run build    # Catch build errors
   ```

2. **Test on staging before production**
   - Deploy to staging
   - Visit https://staging.dealerwyze.com
   - Test both vertical flows (dealer + agent)

3. **Write clear commit messages**
   ```bash
   git commit -m "feat: add SMS rate limiting
   
   - Implement 20 SMS/5min limit per org
   - Return 429 when limit exceeded
   - Log violations for audit trail"
   ```

4. **Use PR reviews**
   - Push feature branch
   - Open PR on GitHub
   - Wait for review approval
   - Merge after approval

5. **Watch both domains after production deploy**
   ```bash
   curl -I https://dealerwyze.com
   curl -I https://realtywyze.us
   # Both should return HTTP 200
   ```

---

## Environment Variables

All env vars are configured in Vercel project settings (not in `.env` files):

**Staging Project (dealer-wyze-staging):**
- Same env vars as production
- Points to production database (for realistic testing)

**Production Project (dealer-wyze):**
- Stripe LIVE keys (not test keys)
- Twilio LIVE credentials
- All third-party integrations in production mode

**Local Development (.env.local):**
- Create `.env.local` from `.env.example`
- Use development API keys
- Never commit `.env.local`

---

## Monitoring

### After Each Deploy

```bash
# Verify domains respond
curl -I https://dealerwyze.com
curl -I https://realtywyze.us

# Check Vercel deployment status
# https://vercel.com/apollo-projects/dealer-wyze/deployments

# Check application logs (if Vercel logs are available)
# Watch for errors in Sentry
# https://sentry.io/organizations/.../issues/
```

### Key Metrics to Watch

- Build time (should be <3 min)
- API response time (should be <200ms)
- Error rate (should be <1%)
- Domains both responding (HTTP 200)
- Both verticals accessible

---

## Questions?

Refer to:
- `GIT_STRUCTURE.md` — Repository and branching overview
- `DEPLOY.md` — This file
- Vercel Dashboard → https://vercel.com/apollo-projects
- GitHub → https://github.com/themios/dealerwyze-app
