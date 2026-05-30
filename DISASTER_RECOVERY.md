# Disaster Recovery Plan

**DealerWyze SaaS | Production Environment**

Last Updated: 2026-05-30

---

## 1. Critical Services & RTO

| Service | Component | RTO | RPO | Owner |
|---------|-----------|-----|-----|-------|
| **Database** | Supabase Postgres | 1 hour | 15 min | Cloud provider + backup |
| **Auth** | Supabase Auth | 1 hour | real-time | Cloud provider |
| **File Storage** | Supabase Storage | 4 hours | 1 hour | Cloud provider |
| **Realtime** | Supabase Realtime | 2 hours | 5 min | Cloud provider |
| **App Server** | Vercel Next.js | 30 min | 1 min | Vercel (auto-failover) |
| **Email** | Resend API | 4 hours | 1 hour | Third-party SaaS |
| **SMS/Voice** | Twilio | 2 hours | 1 hour | Third-party SaaS |
| **Payments** | Stripe | 4 hours | 1 hour | Third-party SaaS |
| **Cache** | Upstash Redis | 8 hours | 1 day | Third-party SaaS |

**RTO = Recovery Time Objective (max downtime)**  
**RPO = Recovery Point Objective (max data loss)**

---

## 2. Incident Severity Levels

### P0 (Critical — Page On-Call)
- **Auth system down** (users cannot log in)
- **Database unavailable** (app cannot read/write)
- **Vercel deployment failing** (app unreachable)
- **Data corruption** (corrupt org/customer records)

### P1 (High — Engage Within 1 Hour)
- **Stripe webhook failures** (payments not processing)
- **SMS/voice outages** (dealers cannot contact customers)
- **Email send failures** for critical flows (onboarding, payment confirmations)
- **Realtime lag** >5 minutes (live updates stalled)

### P2 (Medium — Engage Within 4 Hours)
- **File upload/download failures** (non-critical)
- **Analytics/reporting lag** (historical, not real-time)
- **Cache misses** (service degrades gracefully)

### P3 (Low — Next Business Day)
- **Minor UI bugs** (functionality intact)
- **Performance degradation** <500ms
- **Non-critical integrations** (Zapier, etc.)

---

## 3. Detection & Alerting

### Automated Monitors (Set Up in Vercel)
```
- Deployment failures → Slack alert to #incidents
- 5xx error rate >1% for 5 min → page on-call
- Database connection timeouts >3 → page on-call
- Auth login failure rate >5% → page on-call
```

### Manual Health Checks
**Run every 15 min (or set up Uptime Robot):**
```bash
curl -s https://dealerwyze.com/health \
  -H "User-Agent: HealthCheck" \
  -w "HTTP %{http_code}\n"
```

Expected response: `HTTP 200` with `{ "status": "ok" }`

**Check critical endpoints:**
- `GET /api/health` — Database connectivity
- `GET /api/auth/user` (with valid token) — Auth + session
- `GET /api/org/settings` (with valid token) — RLS + org scoping

---

## 4. Runbooks by Scenario

### Scenario A: Database Down (Supabase Postgres Unavailable)

**Detection:** Login fails, app shows "Database connection error"

**Step 1: Confirm & Notify (2 min)**
```bash
# Check Supabase status
curl -s https://status.supabase.com/api/v2/status.json | jq '.status'

# Notify team in Slack #incidents channel
# Message: "P0: Database unavailable — checking Supabase status"
```

**Step 2: Check Supabase Dashboard (5 min)**
- Go to https://app.supabase.com → Project → Database
- Check for: active queries, locked tables, storage usage
- If no obvious issue → escalate to Supabase support

**Step 3: Failover (if available)**
- Supabase provides read-only replica in secondary region
- Update `NEXT_PUBLIC_SUPABASE_URL` to replica endpoint in Vercel env
- Redeploy: `vercel deploy --prod`
- RTO: ~15 min (if replica healthy)

**Step 4: Restore from Backup (if replica down)**
- Supabase auto-backups hourly (check Backups tab)
- Request restore: Supabase Dashboard → Backups → Restore
- Supabase performs restore (typically 30-60 min)
- **Data loss:** up to 1 hour of writes
- Notify orgs: "Your data has been restored from an earlier checkpoint"

**Step 5: Post-Incident**
- [ ] Document downtime duration and root cause
- [ ] Review Supabase logs for slow queries or locks
- [ ] Optimize any slow queries identified
- [ ] Update alerting thresholds if needed

---

### Scenario B: App Deployment Broken (500 Errors)

**Detection:** Vercel shows failed deployment, users see error page

**Step 1: Immediate Rollback (2 min)**
```bash
# Go to https://vercel.com/dealerwyze-crm/apollo-crm/deployments
# Find last known good deployment (green checkmark, <1 hour old)
# Click "Promote to Production"
```

**Step 2: Verify Rollback (3 min)**
```bash
curl -s https://dealerwyze.com/health && echo "✓ App responding"

# Check a real endpoint
curl -s -H "Authorization: Bearer <test-token>" \
  https://dealerwyze.com/api/org/settings | jq '.' | head -5
```

**Step 3: Investigate Broken Deployment (while rolled back)**
- Check Vercel build logs: "Deployments" → failed build → "Logs" tab
- Common causes:
  - Type error (`npm run build` would have caught)
  - Missing env var (check Vercel Settings → Environment Variables)
  - Dependency missing (package.json mismatch)

**Step 4: Fix & Redeploy**
```bash
# Fix locally
git log --oneline -5  # Find what changed
git show <commit>     # Review changes
git revert <commit> && git push  # OR fix and commit new change

# Vercel auto-deploys on push to main
# Monitor: https://vercel.com/deployments
```

**Step 5: Post-Incident**
- [ ] Review git history: what broke the build?
- [ ] Run `npm run build` locally before pushing next time
- [ ] Consider adding pre-commit hook: `npm run build` (catches 90% of issues)

---

### Scenario C: Auth System Compromised (Token Leakage)

**Detection:** Unusual login patterns, multiple failed attempts, or report of leaked secret

**Step 1: Immediate Actions (5 min)**
```bash
# 1. Rotate Supabase JWT secret (immediate)
#    - Go to Supabase Dashboard → Project Settings → API
#    - Click "Rotate secret" on JWT secret
#    - Existing tokens invalidated after rotation

# 2. Invalidate all active sessions
#    - Run RPC: SELECT invalidate_all_sessions();
#    - Users must log in again

# 3. Review audit_log
SELECT * FROM audit_log 
  WHERE action IN ('impersonation_start', 'webhook_auth_failure')
  ORDER BY created_at DESC LIMIT 20;
```

**Step 2: Identify Scope (10 min)**
- Check if specific org/user affected or system-wide
- Review `audit_log` for unusual access patterns
- If impersonation detected: check `dealerwyze_staff_org_id` cookie usage

**Step 3: Notify Affected Users**
```
Subject: Security Notice — Please Log In Again
Body:
We've detected unusual activity on dealerwyze.com and have logged all users out as a precaution. 
Please log in again at https://dealerwyze.com/login. 
Your data is secure. Contact support@dealerwyze.com with questions.
```

**Step 4: Post-Incident**
- [ ] Audit git history: who has access to `.env.local`?
- [ ] Rotate any exposed secrets (Stripe, Twilio, etc.)
- [ ] Enable 2FA on all developer accounts
- [ ] Review staff impersonation logs for anomalies

---

### Scenario D: Data Corruption (Corrupt Org/Customer Records)

**Detection:** Dashboard shows wrong data, users report missing transactions

**Step 1: Identify Scope (10 min)**
```bash
# Find affected orgs/records
SELECT org_id, COUNT(*) FROM customers 
  WHERE updated_at > NOW() - INTERVAL '1 hour'
  GROUP BY org_id
  ORDER BY COUNT(*) DESC;

# Backup current state (before rolling back)
COPY (SELECT * FROM customers WHERE org_id = '<affected-org>')
  TO '/tmp/corrupted-backup.csv';
```

**Step 2: Isolate (5 min)**
- If isolated to 1-2 orgs: restore those orgs from backup only
- If system-wide: full database restore (requires downtime)

**Step 3: Restore from Backup**
- Supabase Dashboard → Backups → Restore (select point-in-time)
- Choose restore time just before corruption occurred
- **Data loss:** up to RPO (15 min for Supabase)

**Step 4: Verify Data Integrity (10 min)**
```bash
# Spot-check restored data
SELECT * FROM customers WHERE org_id = '<test-org>' LIMIT 5;
SELECT * FROM activities WHERE org_id = '<test-org>' LIMIT 5;
SELECT * FROM bhph_payments WHERE created_at > NOW() - INTERVAL '1 hour' LIMIT 5;
```

**Step 5: Notify & Communicate**
- Contact affected org: "Your records were restored from a 15-min backup"
- Log incident: root cause (bad query, bad migration, app bug)

**Step 6: Post-Incident**
- [ ] Review migration history: was a recent migration faulty?
- [ ] Add constraint checks to migrations (e.g., `NOT NULL` checks)
- [ ] Test backups monthly (restore to staging and validate)

---

### Scenario E: Email/SMS Outage (Resend or Twilio Down)

**Detection:** Users report not receiving notifications; Resend/Twilio status shows degradation

**Step 1: Check External Service Status**
```
- Resend: https://status.resend.com
- Twilio: https://status.twilio.com
```

**Step 2: If Third-Party Issue (Escalate)**
- Contact support@resend.com or support@twilio.com with incident details
- Post on status page if available (Twilio does this automatically)
- Notify orgs: "Email/SMS delivery is temporarily delayed"

**Step 3: If API Key Issue (Rotate)**
```bash
# Check Vercel env vars
vercel env ls

# Verify API key is correct and not expired
# Resend: https://resend.com/api-keys
# Twilio: https://www.twilio.com/console/account/keys

# If key expired or leaked → rotate in Vercel Settings
```

**Step 4: Graceful Degradation**
- App should log failures but not crash (already implemented)
- Offer workaround: "Try again in 5 min" or manual fallback

**Step 5: Post-Incident**
- [ ] Review rate limits (did we exceed quota?)
- [ ] Add monitoring for delivery failures (webhook parsing)
- [ ] Consider backup email provider (SendGrid, Mailgun)

---

## 5. Communication & Incident Response

### Notification Flow
1. **Detection** → Slack #incidents channel (auto or manual)
2. **Triage** → Assess severity (P0/P1/P2/P3)
3. **Escalation** → If P0/P1: page on-call engineer
4. **Status Page** → Update https://status.dealerwyze.com (if public)
5. **Customer Comms** → Email affected orgs (if >15 min downtime)
6. **Resolution** → Update Slack when resolved
7. **Post-Mortem** → Document within 24 hours

### Slack Template
```
:warning: P<severity>: <Issue>
Status: INVESTIGATING
Duration: <start time>
Affected: <users/orgs/features>
ETA: <estimated recovery>
Updates: <ongoing notes>
```

### Customer Email Template
```
Subject: Incident Report — <Service> Unavailable

We experienced an issue with <service> from <start> to <end> UTC.

Impact: <what users couldn't do>
Cause: <root cause>
Resolution: <what we did>
Prevention: <what we'll do differently>

We apologize for the disruption. Contact support@dealerwyze.com.
```

---

## 6. Backup & Restore Procedures

### Supabase Backups (Automatic)
- **Frequency:** Hourly
- **Retention:** 7 days
- **Access:** Supabase Dashboard → Project → Backups
- **Restore Time:** 30-60 min (managed by Supabase)
- **Test Frequency:** Monthly (restore to staging DB)

### Manual Backup (Monthly)
```bash
# Export all org data to CSV (for audit trail)
pg_dump -h <supabase-host> -U postgres -F tar -f backup-$(date +%Y%m%d).tar \
  --data-only \
  --no-privileges \
  dealerwyze_db

# Store on S3 or external storage
aws s3 cp backup-*.tar s3://dealerwyze-backups/postgres/
```

### Test Restore Procedure (Monthly)
1. Restore backup to staging DB
2. Verify row counts match production
3. Spot-check critical tables: `customers`, `organizations`, `bhph_payments`
4. Run integrity checks: `SELECT pg_catalog.pg_filenode_relation(oid) FROM pg_class WHERE relname = 'customers';`

---

## 7. On-Call Rotation & Handoff

### On-Call Schedule
- **Primary:** Mon-Fri 9am-5pm (business hours)
- **Secondary:** Fri 5pm - Mon 9am + weekends (escalation only)
- **Handoff:** Friday 5pm (document ongoing issues, update runbooks)

### Required Skills for On-Call
- [ ] Access to Vercel, Supabase, Stripe, Twilio dashboards
- [ ] Know how to read Postgres logs and Vercel build logs
- [ ] Familiar with runbooks above (review before taking shift)
- [ ] Slack notification: `@channel: <name> is now on-call`

### Escalation Path
1. **On-Call Engineer** investigates P0/P1, follows runbook
2. **If stuck >10 min:** call Tim (product owner/architect)
3. **If stuck >30 min:** escalate to external vendor (Supabase/Twilio/Stripe)

### Handoff Checklist
```
- [ ] Document any ongoing incidents
- [ ] Update this runbook with new learnings
- [ ] Rotate Slack history to #incidents-archive
- [ ] Check cron jobs ran (see lib/cron/jobs/)
- [ ] Verify no email send failures in last 24h
- [ ] Check database disk usage: Supabase Dashboard
```

---

## 8. Monthly Exercises

**DR Drill Schedule:** First Monday of each month, 10am UTC

### Drill 1: Database Restore
1. Restore Supabase backup to staging
2. Run smoke tests (login, create org, send email)
3. Verify data integrity
4. **Document:** Time to restore, any issues

### Drill 2: Deployment Rollback
1. Deploy a known-bad version to staging
2. Trigger rollback procedure
3. Verify app recovers
4. **Document:** Rollback time, ease of recovery

### Drill 3: Incident Response Communication
1. Simulate P0 incident in Slack
2. Practice customer notification email
3. Post status page update
4. **Document:** Communication clarity, gaps

---

## 9. Appendix: Critical Contacts

| Service | Contact | Response Time |
|---------|---------|----------------|
| Supabase Support | support@supabase.com | 1-4 hours |
| Twilio Support | support@twilio.com | <1 hour (billing) |
| Stripe Support | support@stripe.com | 1-4 hours |
| Resend Support | support@resend.com | 1 hour |
| Vercel Support | support@vercel.com | 2-4 hours |

**Internal:**
- Tim (Owner): [Phone/Slack DM]
- On-Call: Check Slack status in #on-call channel

---

## 10. Metrics & Reporting

**Track monthly:**
- Uptime %: (total time - downtime) / total time
- MTTR (Mean Time To Recovery): avg time from detection to resolution
- MTTF (Mean Time To Failure): hours between incidents
- Incident count by severity (P0/P1/P2/P3)

**Goal:** >99.5% uptime, <15 min MTTR for P0

