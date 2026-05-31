# MLS Bridge Integration — QA & Testing Plan

## Quick Start (for QA)

### 1. Set Up Test Environment

```bash
# Clone/pull latest code
git pull origin main

# Install dependencies (if needed)
npm install

# Set environment variables (ask Tim for sandbox key)
export BRIDGE_API_BASE=https://api.bridgeinteractive.dev/
export BRIDGE_WEBHOOK_SECRET=test_secret_key_123
```

### 2. Run Local Instance

```bash
npm run dev
# Opens http://localhost:3000
```

### 3. Create Test Org & Agent

```bash
# Via Supabase CLI or SQL editor:
INSERT INTO organizations (name, vertical, slug) 
VALUES ('QA Test RE', 'real_estate', 'qa-test-re') 
RETURNING id;

-- Note the returned org_id

UPDATE profiles 
SET 
  mls_board_id = 'sandbox_mls',
  bridge_agent_id = 'qa.test@bridge.dev',
  bridge_api_key = 'sk_test_...',  -- Sandbox key from Bridge
  mls_license_number = 'CA-123456'
WHERE org_id = {org_id}
  AND id = {agent_id};
```

---

## Test Plan

### Test Suite 1: API Integration

#### 1.1 Bridge API Client — Connection Test
**Test**: Verify Bridge API connection works
```bash
# Call test endpoint with valid sandbox credentials
curl -X POST http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "qa.test@bridge.dev",
    "boardId": "sandbox_mls",
    "apiKey": "sk_test_..."
  }'
```

**Expected Result**:
```json
{
  "success": true,
  "listings_fetched": 10,  // Sandbox returns test data
  "listings_created": 5,
  "listings_updated": 5,
  "errors": [],
  "timestamp": "2026-05-31T14:30:00Z"
}
```

**Acceptance Criteria**:
- [ ] HTTP 200 response
- [ ] Listings fetched > 0
- [ ] No errors in response

#### 1.2 Bridge API Client — Invalid Credentials
**Test**: Verify proper error handling for bad credentials
```bash
curl -X POST http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {jwt_token}" \
  -d '{
    "agentId": "invalid@test.com",
    "boardId": "invalid_board",
    "apiKey": "sk_invalid_key"
  }'
```

**Expected Result**:
- HTTP 400 or 503 response
- Error message: "Bridge API error: ..."
- Sync log records failure

**Acceptance Criteria**:
- [ ] HTTP 400/503 response
- [ ] Clear error message
- [ ] Sync log created with status='failed'

#### 1.3 MLS Sync — Listing Creation
**Test**: Verify listings are created in vehicles table
```bash
# After 1.1 passes, query database:
SELECT id, mls_number, address_line1, price, mls_synced_at, mls_source
FROM vehicles
WHERE user_id = '{org_id}' AND mls_number IS NOT NULL
ORDER BY mls_synced_at DESC;
```

**Expected Result**:
```
id | mls_number | address_line1 | price | mls_synced_at | mls_source
---|-----------|---------------|-------|---------------|----------
... | 123456 | 123 Main St | 850000 | 2026-05-31... | bridge
```

**Acceptance Criteria**:
- [ ] New listings created (count matches sync response)
- [ ] mls_number populated (unique)
- [ ] mls_synced_at set to current timestamp
- [ ] mls_source = 'bridge'
- [ ] price, bedrooms, bathrooms populated from Bridge

#### 1.4 MLS Sync — Listing Update
**Test**: Verify existing listings are updated (price change)
```bash
# Modify a Bridge listing price in sandbox
# Re-run sync endpoint
curl -X POST http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {jwt_token}" \
  -d '{...}'

# Query database:
SELECT mls_number, price, price_history, mls_synced_at
FROM vehicles
WHERE mls_number = '123456';
```

**Expected Result**:
```
mls_number | price | price_history | mls_synced_at
-----------|-------|---------------|---------------
123456 | 825000 | [{price: 850000, date: ...}, {price: 825000, date: ...}] | 2026-05-31T15:00:00Z
```

**Acceptance Criteria**:
- [ ] Existing listing updated (no new row created)
- [ ] price_history appended (not replaced)
- [ ] mls_synced_at updated to new timestamp
- [ ] Sync response shows listings_updated > 0

---

### Test Suite 2: Public IDX Feed

#### 2.1 Public Listings Grid
**Test**: Verify MLS listings appear on public site
```
Visit: http://localhost:3000/qa-test-re/listings
```

**Expected Result**:
- Grid shows all MLS listings
- MLS listings appear first (sorted by mls_synced_at DESC)
- Each card shows:
  - Photo (or placeholder)
  - Price
  - Address
  - Beds, Baths, Sqft
  - MLS # and DOM

**Acceptance Criteria**:
- [ ] At least 5 listings visible
- [ ] MLS listings on top
- [ ] All fields populated correctly
- [ ] Photos load (or placeholder visible)
- [ ] DOM displayed as "Nd" (e.g., "15d")

#### 2.2 Listing Detail Page
**Test**: Verify MLS fields on detail page
```
Click on a listing from grid
```

**Expected Result**:
- Page shows:
  - Large hero photo
  - Price
  - Address
  - Status badge (if Pending/Sold)
  - Key stats (beds, baths, sqft, lot, year built)
  - MLS-specific fields:
    - MLS # (displayed prominently)
    - MLS Status (active/pending/sold/expired)
    - Days on Market
  - Description (from MLS PublicRemarks)
  - Showing Request form

**Acceptance Criteria**:
- [ ] MLS # displays correctly
- [ ] MLS Status badge visible
- [ ] Days on Market shows correct number
- [ ] Description matches Bridge data
- [ ] Page loads <3s on 4G mobile

#### 2.3 SEO Meta Tags
**Test**: Verify open graph and canonical tags
```bash
# Fetch page source:
curl http://localhost:3000/qa-test-re/listings/{listing_id} | grep -E "og:|canonical|title|description"
```

**Expected Result**:
```html
<title>123 Main St - $850,000 - QA Test RE</title>
<meta name="description" content="Single Family home...">
<meta property="og:title" content="123 Main St - $850,000">
<meta property="og:description" content="...">
<meta property="og:image" content="https://...photo_url...">
<link rel="canonical" href="https://realtywyze.us/qa-test-re/listings/...">
```

**Acceptance Criteria**:
- [ ] og:title includes address and price
- [ ] og:image points to actual listing photo
- [ ] description is substantive (not generic)
- [ ] Canonical URL correct

#### 2.4 Mobile Responsiveness
**Test**: Verify public site is responsive
```
1. Open http://localhost:3000/qa-test-re/listings on iPhone (DevTools)
2. Check viewport: 375px (iPhone SE)
```

**Expected Result**:
- No horizontal scroll
- Text readable at 16px minimum
- Buttons tappable (44px min)
- Grid collapses to single column
- Photos scale correctly

**Acceptance Criteria**:
- [ ] No horizontal scroll on 375px viewport
- [ ] Text visible without zoom
- [ ] Buttons tappable (not tiny)
- [ ] Layout single-column on mobile

---

### Test Suite 3: Webhook Integration

#### 3.1 Webhook Signature Validation
**Test**: Verify invalid signatures are rejected
```bash
# POST with invalid signature:
curl -X POST http://localhost:3000/api/webhooks/bridge \
  -H "x-bridge-signature: invalid_signature" \
  -H "Content-Type: application/json" \
  -d '{"event": "price.changed", "mls_number": "123456", ...}'
```

**Expected Result**:
- HTTP 401 Unauthorized
- Audit log created: action='webhook_auth_failure', metadata.reason='invalid_signature'

**Acceptance Criteria**:
- [ ] HTTP 401 response
- [ ] webhook_auth_failure audit logged
- [ ] No database update occurs

#### 3.2 Webhook Price Change
**Test**: Verify price change webhook updates listing
```bash
# (After registering webhook in Bridge sandbox)
# Manually update listing price in Bridge sandbox
# Wait for webhook to fire

# Check database:
SELECT price, price_history FROM vehicles WHERE mls_number = '123456';
```

**Expected Result**:
- Listing price updated
- Price appended to price_history array
- mls_synced_at updated
- webhook_idempotency record created

**Acceptance Criteria**:
- [ ] Price updated correctly
- [ ] price_history has new entry
- [ ] No duplicate processing (webhook_idempotency prevents)

#### 3.3 Webhook Idempotency
**Test**: Verify duplicate webhooks are ignored
```bash
# Send same webhook twice:
curl -X POST http://localhost:3000/api/webhooks/bridge \
  -H "x-bridge-signature: {valid_sig}" \
  -d '{"event": "status.changed", "mls_number": "123456", ...}'

# Send again with identical payload
curl -X POST http://localhost:3000/api/webhooks/bridge \
  -H "x-bridge-signature: {valid_sig}" \
  -d '{"event": "status.changed", "mls_number": "123456", ...}'
```

**Expected Result**:
- First request: HTTP 200, update occurs
- Second request: HTTP 200, returns `{"status": "duplicate"}`, no update

**Acceptance Criteria**:
- [ ] Both requests return 200
- [ ] Second marked as duplicate
- [ ] Database updated only once

---

### Test Suite 4: Cron Job

#### 4.1 Daily Sync Execution
**Test**: Verify cron job runs at 6 AM UTC
```bash
# Manually trigger cron endpoint (if available):
curl -X POST http://localhost:3000/api/cron/check-tasks \
  -H "Authorization: Bearer {cron_secret}"

# Or: Wait until 6 AM UTC next day and monitor logs
tail -f /var/log/application.log | grep "mls-sync"
```

**Expected Result**:
- Cron job executes
- All configured agents synced
- mls_sync_log records created
- No errors in logs

**Acceptance Criteria**:
- [ ] Cron job executes without errors
- [ ] mls_sync_log records created for each agent
- [ ] Listing counts match Bridge API

#### 4.2 Cron Fallback (Profile Config)
**Test**: Verify cron reads from agent profile if no request body
```bash
# Ensure agent profile has MLS config:
SELECT mls_board_id, bridge_api_key FROM profiles WHERE id = {agent_id};

# Agent calls sync without explicit credentials:
curl -X POST http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**:
- Sync succeeds using profile config
- Same results as explicit credentials

**Acceptance Criteria**:
- [ ] Sync works with empty request body
- [ ] Profile config used automatically
- [ ] Results match explicit auth

---

### Test Suite 5: Data Integrity

#### 5.1 RLS Policies
**Test**: Verify agents can't see other agents' listings
```bash
# Log in as agent A, request agent B's listings:
curl -X GET http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {agent_a_token}" \
  -d '{...agent_b_org_id...}'
```

**Expected Result**:
- HTTP 403 Forbidden OR lists only agent A's org listings
- Agent A never sees agent B's MLS data

**Acceptance Criteria**:
- [ ] RLS prevents cross-org access
- [ ] No data leakage between agents

#### 5.2 MLS Listing Uniqueness
**Test**: Verify MLS #'s are unique per board
```sql
SELECT mls_number, mls_board_id, COUNT(*)
FROM vehicles
WHERE mls_number IS NOT NULL
GROUP BY mls_number, mls_board_id
HAVING COUNT(*) > 1;
```

**Expected Result**:
- Empty result set (no duplicates)

**Acceptance Criteria**:
- [ ] No duplicate mls_number for same board
- [ ] Schema constraint enforced (UNIQUE)

#### 5.3 Sync Log Audit Trail
**Test**: Verify all syncs logged correctly
```sql
SELECT agent_id, mls_board_id, synced_at, listings_synced, listings_created, listings_updated, status
FROM mls_sync_log
ORDER BY synced_at DESC
LIMIT 10;
```

**Expected Result**:
- One row per sync operation
- Counts match vehicle table changes
- Errors logged in 'errors' field
- Status = 'success' or 'failed' or 'partial'

**Acceptance Criteria**:
- [ ] All syncs logged
- [ ] Counts accurate
- [ ] Errors captured
- [ ] No null timestamps

---

### Test Suite 6: Error Handling

#### 6.1 Missing MLS Config
**Test**: Agent with no MLS setup tries to sync
```bash
# Agent has no mls_board_id set
curl -X POST http://localhost:3000/api/integrations/mls/sync \
  -H "Authorization: Bearer {jwt_token}" \
  -d '{}'
```

**Expected Result**:
- HTTP 400
- Error message: "MLS credentials not configured. Set up MLS in your profile settings."

**Acceptance Criteria**:
- [ ] HTTP 400 response
- [ ] Clear, actionable error message
- [ ] No partial data created

#### 6.2 Bridge API Timeout
**Test**: Bridge API doesn't respond within 30s
```bash
# (Simulate by mocking Bridge to delay)
# Sync should timeout gracefully
```

**Expected Result**:
- HTTP 400 or 503
- Error message: "Bridge API timeout"
- Sync log records failure
- No partial listings created

**Acceptance Criteria**:
- [ ] Timeout handled gracefully
- [ ] Error logged
- [ ] Transaction rolled back

#### 6.3 Invalid Listing Data
**Test**: Bridge returns malformed listing
```bash
# Verify schema validation
```

**Expected Result**:
- Invalid listing skipped
- Valid listings still created
- Error logged with MLS number
- Sync completes with status='partial'

**Acceptance Criteria**:
- [ ] Invalid listings skipped
- [ ] Valid listings processed
- [ ] Error captured in mls_sync_log

---

## Regression Testing

### Checklist

- [ ] Existing agent features not broken (SMS, voice, email)
- [ ] Manual (non-MLS) listings still work
- [ ] Public site loads for agents with and without MLS
- [ ] Dashboard/Today page loads correctly
- [ ] No new database errors in logs
- [ ] Performance: page load <3s (on 4G)
- [ ] Mobile responsive (375px+)
- [ ] Accessibility: color contrast WCAG AA, keyboard nav

---

## Performance Testing

### Load Testing (Optional, Post-MVP)

```bash
# Simulate 100 agents syncing simultaneously
ab -n 100 -c 10 http://localhost:3000/api/integrations/mls/sync
```

**Target**:
- Avg response time: <5s
- Max response time: <15s
- Error rate: <1%

### Database Query Performance

```sql
-- Verify indexes used:
EXPLAIN ANALYZE SELECT * FROM vehicles 
WHERE mls_number IS NOT NULL 
ORDER BY mls_synced_at DESC 
LIMIT 100;

-- Expected: uses idx_vehicles_mls_synced index
```

---

## Sign-Off

**QA Lead**: ___________________
**Date**: _____________________

**Test Results**:
- [ ] All Test Suite 1 tests PASS
- [ ] All Test Suite 2 tests PASS
- [ ] All Test Suite 3 tests PASS
- [ ] All Test Suite 4 tests PASS
- [ ] All Test Suite 5 tests PASS
- [ ] All Test Suite 6 tests PASS
- [ ] Regression testing PASS
- [ ] Security audit PASS

**Ready for GA**: YES / NO
