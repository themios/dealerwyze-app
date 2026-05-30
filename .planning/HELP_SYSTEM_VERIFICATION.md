# Help System Verification Protocol

Quick manual tests to run before deploying to staging.

## Pre-Deploy: Local Verification (2 min)

```bash
# 1. Verify build
npm run build 2>&1 | grep -i error && echo "FAIL" || echo "PASS: Build clean"

# 2. Verify ESLint
npx eslint components/help app/api/help lib/help --max-warnings=0 && echo "PASS" || echo "FAIL"

# 3. Verify no console errors in dev server
npm run dev &
# Navigate to any auth-protected page, open console (F12)
# Check: No red errors, HelpButton renders in bottom-right
# Click HelpButton → panel slides in
# Search for "password" → shows 1-2 results
# Click result → shows full article with markdown (bold + links)
kill %1
```

## Staging: Database & API Tests (5 min)

```bash
# 4. Migration runs
npx supabase migration up  # or your staging deploy script

# 5. Verify seed data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM help_articles;"
# Expected: 20

# 6. Verify vertical filtering
psql $DATABASE_URL -c "SELECT COUNT(*) FROM help_articles WHERE vertical IN ('dealer', 'both');"
# Expected: >= 13

psql $DATABASE_URL -c "SELECT COUNT(*) FROM help_articles WHERE vertical IN ('real_estate', 'both');"
# Expected: >= 7

# 7. Test search endpoint (from authenticated browser)
curl -X GET "https://staging.dealerwyze.com/api/help/articles?query=password" \
  -H "Cookie: <your-session-cookie>"
# Expected: 200 OK, returns articles with "password" in question/answer/keywords

# 8. Test ask endpoint (from authenticated browser)
curl -X POST "https://staging.dealerwyze.com/api/help/ask" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "question": "How do I change my password?",
    "currentPage": "/settings/account"
  }'
# Expected: 200 OK, returns { answer: "...", responseTime: N, model: "groq" }
# Answer should be ~2-3 sentences about going to Settings > Account

# 9. Test vertical context (switch orgs or check org vertical)
# For RE org, ask same question
# Expected: answer uses "your account" not "your dealership" or vehicle terminology
```

## User Flow Tests (3 min)

1. **From Dealer Org (dealer vertical):**
   - Go to `/customers` page
   - Click help button (bottom-right)
   - Search: "add lead" → should show "How do I add a new customer?"
   - Click result → answer says "customer" not "client"
   - Click "Customer List" button → navigates to /customers

2. **From RE Org (real_estate vertical):**
   - Go to `/listings` page (or similar RE page)
   - Click help button
   - Search: "add" → should show "How do I add a new client?" AND other articles
   - Click result → answer says "client" not "customer"
   - Verify all article questions use RE terminology

3. **AI Ask (dealer org):**
   - Open panel, click "Ask AI" tab
   - Type: "What's the difference between a lead and a customer?"
   - Hit "Get Answer"
   - Expected: ~2 sec response, answer explains the CRM pipeline context

4. **Mobile (iPhone/iPad breakpoint):**
   - Resize browser to 375px width
   - Help button appears (bottom-right)
   - Click → panel goes full-width
   - Overlay appears behind panel
   - Click overlay → panel closes
   - Search works on mobile keyboard

5. **Groq Fallback (optional — disable GROQ_API_KEY temporarily):**
   - Set `GROQ_API_KEY=""` in .env.local
   - Restart dev server
   - Click Ask AI → try to submit question
   - Expected: error message "Help system temporarily unavailable. Try searching articles instead."

## Deployment Gate

All 9 tests must pass + visual QA before:
```bash
git push origin main  # or your deploy trigger
```

If any test fails, revert commit and debug locally first.

## Rollback (If Needed)

```bash
# Remove migration
npx supabase migration down

# Revert code commit
git revert HEAD

# Redeploy
./deploy-staging.sh
```

---

**Estimated Total Time:** 10 minutes
**Owner:** Tim (manual QA required)
