# Disaster Recovery Restore Drill

Procedure for testing database backup recovery and RTO (Recovery Time Objective) in a staging environment.

**Objective:** Verify we can restore a Supabase backup and validate data integrity within documented RTO.

---

## Prerequisites

- Access to Supabase backup storage (encrypted backups stored in S3 or Supabase managed backup)
- Staging Supabase project (separate from production)
- SSH access to staging infrastructure (Vercel staging deployment)
- Encryption key for backup decryption (stored securely, separate from code)
- ~2 hours of availability

---

## Pre-Drill Checklist

- [ ] **Backup availability:** Verify latest backup exists and timestamp is recent (< 24h old)
- [ ] **Encryption key accessible:** Confirm decryption key is retrievable from secure storage
- [ ] **Staging project ready:** Staging Supabase has no active users; safe to drop and restore
- [ ] **Rollback plan:** Document how to quickly revert staging to pre-drill state
- [ ] **Communication:** Notify Tim; no concurrent staging activity during drill

---

## Drill Steps

### Phase 1: Backup Preparation (15 min)

**1.1 Locate latest backup**

```bash
# Check Supabase backup listing
# Path: Supabase console → Project → Settings → Backups

# Record:
BACKUP_ID="<backup_id>"
BACKUP_TIMESTAMP="<yyyy-mm-dd HH:MM:SS UTC>"
BACKUP_SIZE="<size in GB>"
```

Example backup ID: `bak_abc123xyz` (from Supabase console)

**1.2 Verify backup metadata**

```bash
# Confirm:
- Backup is marked "Completed" (not "In Progress" or "Failed")
- Backup includes full schema + data
- Creation timestamp is < 24 hours old
```

**1.3 Retrieve encryption key**

```bash
# Encryption key stored in:
# - AWS Secrets Manager, or
# - Local `.env.backup.key` (NEVER commit to repo)
# - Tim's secure password manager

BACKUP_KEY="<decryption key>"
```

### Phase 2: Restore to Staging (45 min)

**2.1 Initiate restore via Supabase CLI**

```bash
# Supabase provides restore API or CLI command
# Check: https://supabase.com/docs/guides/platform/backups#restore-backup

# Example (Supabase REST API):
curl -X POST \
  'https://api.supabase.com/v1/projects/{project-id}/database/backups/restore' \
  -H 'Authorization: Bearer <SUPABASE_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "backup_id": "'$BACKUP_ID'",
    "restore_target": "staging",
    "encryption_key": "'$BACKUP_KEY'"
  }'
```

**2.2 Monitor restore progress**

```bash
# Supabase console shows restore status
# Watch: Settings → Backups → Recent Activities

# Expected timeline:
# - 0–5 min: Backup download
# - 5–15 min: Decryption
# - 15–40 min: Database restore (depends on size)
# - 40–45 min: Validation

# Stop and escalate if > 45 min
```

**2.3 Record restore completion**

```bash
RESTORE_START_TIME="$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
RESTORE_END_TIME="$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
RESTORE_DURATION=$(($(date -d "$RESTORE_END_TIME" +%s) - $(date -d "$RESTORE_START_TIME" +%s)))
echo "Restore completed in ${RESTORE_DURATION} seconds"
```

### Phase 3: Data Integrity Validation (30 min)

**3.1 Connect to restored staging database**

```bash
# Use staging Supabase credentials
SUPABASE_URL="https://<staging-project>.supabase.co"
SUPABASE_KEY="<staging-anon-key>"

# Test connection:
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/organizations?limit=1"
```

**3.2 Run data integrity checks**

```bash
# Verify critical tables exist and have data

# Check 1: Organizations table
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/organizations?select=count()" | jq '.length'
# Expected: > 0 (at least one org exists)

# Check 2: Customers table
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/customers?select=count()" | jq '.length'
# Expected: > 0 (at least some customers exist)

# Check 3: Auth users
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/auth/v1/admin/users?per_page=1" | jq '.length'
# Expected: > 0 (auth table restored)

# Record results:
echo "Organizations: $(curl -s ...)" >> /tmp/dr_drill_results.txt
echo "Customers: $(curl -s ...)" >> /tmp/dr_drill_results.txt
echo "Auth users: $(curl -s ...)" >> /tmp/dr_drill_results.txt
```

**3.3 Test login flow**

```bash
# Use a test org from backup (e.g., Apollo Auto test tenant)
TEST_EMAIL="test@apolloauto.test"
TEST_PASSWORD="<password from backup>"

# Attempt login:
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }"

# Expected: Returns auth token (200 OK)
# If failed: Check that users and auth.users tables are linked
```

**3.4 Verify key data points**

```bash
# Spot-check critical records:

# - Org settings intact?
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/org_settings?limit=5"

# - Payment records intact?
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/stripe_subscription?limit=5"

# - Audit logs intact?
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/audit_log?limit=5"

# Record: All tables queryable and return data
```

### Phase 4: Application Testing (30 min)

**4.1 Deploy staging build**

```bash
# Staging Vercel deployment should use restored DB
# Verify environment variables point to staging Supabase

# Redeploy staging:
git push origin staging  # or trigger deploy in Vercel console
```

**4.2 Run smoke tests**

```bash
# Test against staging deployment (e.g., staging.dealerwyze.com)

# Test 1: Landing page loads
curl -I https://staging.dealerwyze.com/ | grep "200 OK"

# Test 2: Login flow (use test account)
curl -c /tmp/cookies.txt -d "email=test@apolloauto.test&password=..." \
  https://staging.dealerwyze.com/api/auth/login

# Test 3: Fetch customer data
curl -b /tmp/cookies.txt \
  https://staging.dealerwyze.com/api/customers | jq '.data | length'
# Expected: > 0 customers loaded

# Test 4: Load dashboard
curl -b /tmp/cookies.txt \
  https://staging.dealerwyze.com/app/dashboard | grep -q "Dashboard"
# Expected: Dashboard HTML returned (200 OK)
```

**4.3 Record application health**

```bash
# All smoke tests passed?
echo "✓ Landing page loads" >> /tmp/dr_drill_results.txt
echo "✓ Login successful" >> /tmp/dr_drill_results.txt
echo "✓ Customer data loads" >> /tmp/dr_drill_results.txt
echo "✓ Dashboard renders" >> /tmp/dr_drill_results.txt
```

### Phase 5: Documentation (5 min)

**5.1 Calculate RTO (Recovery Time Objective)**

```bash
# RTO = Time from "disaster detected" to "system back online and tested"
# In this case: From restore initiation to all smoke tests passing

DRILL_START=$(date -d "$(grep 'Restore Start' /tmp/dr_drill_results.txt)" +%s)
DRILL_END=$(date -d "$(grep 'Tests Passed' /tmp/dr_drill_results.txt)" +%s)
RTO=$((DRILL_END - DRILL_START))

echo "RTO: ${RTO} seconds (~$(($RTO / 60)) minutes)" | tee -a /tmp/dr_drill_results.txt
```

**5.2 Document findings**

Create a summary:

```markdown
# DR Drill Results — $(date -u +%Y-%m-%d)

## Backup Info
- ID: $BACKUP_ID
- Timestamp: $BACKUP_TIMESTAMP
- Size: $BACKUP_SIZE GB

## Restore Phase
- Duration: $RESTORE_DURATION seconds
- Status: ✓ Completed
- Issues: None

## Data Validation
- Organizations: ✓ Present
- Customers: ✓ Present
- Auth users: ✓ Present
- Audit logs: ✓ Present

## Application Testing
- Landing page: ✓ OK
- Login: ✓ OK
- Data load: ✓ OK
- Dashboard: ✓ OK

## RTO Summary
- Backup to ready: $RTO seconds
- Target RTO: 4 hours (≤ SLA)
- Status: ✓ PASSED

## Action Items
- [ ] Review findings with Tim
- [ ] Update disaster recovery plan if needed
- [ ] Schedule next drill (quarterly recommended)
```

**5.3 Save results**

```bash
# Archive results for future reference
mkdir -p /tmp/dr_drills
cp /tmp/dr_drill_results.txt "/tmp/dr_drills/dr_drill_$(date +%Y-%m-%d).txt"
```

---

## Post-Drill Cleanup

**6.1 Revert staging database**

```bash
# Important: Restore staging to current production state
# (so staging stays in sync with real data)

# Option A: Re-apply latest production backup to staging
# Option B: Trigger standard staging refresh from production schedule

# Verify staging is back to "normal" state:
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/organizations?limit=1"
```

**6.2 Redeploy staging app**

```bash
# Ensure staging app connects to the "reset" database
git push origin staging
# or re-trigger Vercel deploy
```

**6.3 Notify completion**

Document in project memory:
- Drill date
- RTO achieved
- Any issues found
- Next drill scheduled

---

## Success Criteria

✓ All of the following must be true:

- [ ] Backup successfully decrypted and restored
- [ ] All critical tables present and contain data
- [ ] Login works with credentials from backup
- [ ] Dashboard loads and displays data
- [ ] RTO ≤ 4 hours (enterprise SLA)
- [ ] No data corruption detected
- [ ] Staging cleanly reverted post-drill

---

## Failure Response

If any check fails:

1. **Document the failure** — screenshot, error message, timestamp
2. **Stop further tests** — don't continue if you find a critical issue
3. **Revert staging** — restore staging to pre-drill state
4. **Root-cause analysis** — identify why restore failed
5. **Update runbooks** — adjust DR_RESTORE_DRILL.md or ONCALL_RUNBOOK.md
6. **Escalate to Tim** — brief him on failure and plan to fix

---

## Frequency

- **First drill:** Before launch to production (establish RTO baseline)
- **Quarterly:** Once per quarter (or after major schema changes)
- **After incidents:** If actual recovery happens, run a drill within 1 week

---

## References

- Supabase backup docs: https://supabase.com/docs/guides/platform/backups
- Recovery best practices: https://supabase.com/docs/guides/platform/backups#restore-backup
- ONCALL_RUNBOOK.md: See "Supabase Outage" section for production response
