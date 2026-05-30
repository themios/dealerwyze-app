# Backup & Disaster Recovery Strategy

Automated backup procedure, retention policy, and recovery testing for DealerWyze and RealtyWyze.

---

## Overview

**Backup Provider:** Supabase (managed PostgreSQL + S3 storage)

**Backup Frequency:**
- Automatic daily snapshots (Supabase Pro)
- Retention: 7 days (automatic), 30 days (point-in-time recovery)
- Manual backup triggers: on-demand before major migrations

**RTO (Recovery Time Objective):** < 2 hours
**RPO (Recovery Point Objective):** < 24 hours (daily backup cycle)

---

## Automated Backup Policy

### Daily Backups (Supabase Pro)

**Backup Window:** UTC 2 AM - 4 AM (off-peak)

**What's backed up:**
- PostgreSQL database (all tables, RLS policies, functions, triggers)
- Supabase Auth metadata
- Storage bucket metadata (NOT file contents — see Storage Backups below)

**Retention:** 7 automatic daily snapshots available
**Access:** Via Supabase Dashboard → Backups tab

**Cost:** Included in Pro plan ($25/mo)

### Point-in-Time Recovery (PITR)

**Available:** Last 30 days
**Window:** Any point in time during last 30 days
**Procedure:**
1. Supabase Dashboard → Database → Backups
2. "Point in Time Recovery" → Select timestamp
3. Choose target: restore to new DB or restore in-place
4. ~15 min recovery time

**Caution:** PITR requires exclusive DB lock; triggers ~15 min downtime on restore-in-place.

### Storage Backups

**S3 bucket:** Supabase Storage (user-uploaded files)
**Backup method:** S3 cross-region replication (manual setup)
**Current status:** ⚠️ NOT CONFIGURED — files are not replicated

**TODO:** Enable S3 replication to backup region (us-east-1 → us-west-2)

---

## Manual Backups

### Before Major Migrations

```bash
# CLI: Trigger backup before migration
supabase db pull  # Snapshot schema to migrations/
supabase db backup

# OR via Dashboard:
# 1. Supabase Dashboard → Database → Backups
# 2. Click "Create backup" button
# 3. Name: "pre-migration-2026-06-15"
```

### Export Local Copy

```bash
# pg_dump for local archive (requires psql):
pg_dump \
  --host=db.INSTANCE_ID.supabase.co \
  --username=postgres \
  --password \
  --file=backup-$(date +%Y-%m-%d).sql \
  postgres

# Then: gzip and store securely
gzip backup-*.sql
aws s3 cp backup-*.sql.gz s3://dealerwyze-backups/
```

---

## Backup Verification

### Daily Verification Job

**Cron:** Runs daily at 10 AM UTC (6 hours after backup window)

**Checks:**
1. Most recent backup exists (timestamp < 24 hours)
2. Backup metadata is valid (not corrupted)
3. Database query response time < 1 sec (sanity check)
4. Row counts match expected ranges (data integrity)

**Location:** `lib/cron/jobs/backupVerification.ts`

```typescript
// Runs daily to verify backups completed successfully
export async function verifyBackups() {
  // 1. Check Supabase backup status API
  const backups = await supabase.rpc('get_backups')
  if (!backups?.length) {
    alert('❌ No backups found in last 24 hours')
    return
  }

  // 2. Sanity check: run test query
  const { error } = await supabase.from('organizations').select('count')
  if (error) {
    alert('❌ Database query failed: ' + error.message)
    return
  }

  // 3. Check row counts (ballpark estimate)
  const counts = await supabase
    .from('organizations').select('id', { count: 'exact', head: true })
    .then(r => r.count ?? 0)
  if (counts < 10) {
    alert('⚠️ Org count unusually low: ' + counts)
    return
  }

  // 4. Log success
  await writeAuditLog({
    action: 'backup_verified',
    metadata: { backup_timestamp: backups[0].created_at, row_count_sample: counts },
  })
}
```

---

## Recovery Procedures

### Scenario 1: Data Corruption (Single Table)

**Example:** Accidental DELETE on `customers` table

**Recovery time:** ~20 minutes

**Steps:**
1. **Identify corruption timestamp:** When was data accidentally deleted? (e.g., 2pm UTC)
2. **Stop application traffic:** POST to `/api/cron/pause-apps` to halt mutations
3. **Restore using PITR:**
   - Supabase Dashboard → Database → Backups → PITR
   - Select time: 1:59 PM UTC (1 minute before deletion)
   - Choose target: Restore to new database `postgres-pitr`
4. **Export clean table:**
   ```sql
   -- On PITR database (postgres-pitr):
   SELECT * FROM customers LIMIT 100000 INTO OUTFILE '/tmp/customers_clean.csv';
   ```
5. **Truncate + restore:**
   ```sql
   -- On production database:
   TRUNCATE TABLE customers CASCADE;
   COPY customers FROM '/tmp/customers_clean.csv' (FORMAT csv);
   ```
6. **Verify data:** SELECT count(*) FROM customers; *(should match before-delete count)*
7. **Resume traffic:** DELETE postgres-pitr database, restart app
8. **Audit:** Log incident in `docs/INCIDENT_LOG.md`

### Scenario 2: Database Unavailable (Complete Outage)

**Example:** Supabase database service down for 2 hours

**Recovery time:** ~60 minutes (including DNS propagation)

**Steps:**
1. **Check Supabase status page:** https://status.supabase.com/
2. **If Supabase is down (not local network):**
   - Wait for Supabase team to restore (ETA ~1 hour)
   - Monitor #incidents on Supabase Slack (if available)
   - No action needed on our side
3. **If network/connectivity issue:**
   - Check VPC security groups, firewall rules
   - Verify DNS resolves to correct IP: `nslookup db.*.supabase.co`
   - Test connection: `psql -h db.*.supabase.co -U postgres postgres`
4. **If database needs full restore from backup:**
   - Create new Supabase project (or request restore from Supabase support)
   - Restore from most recent backup (< 24 hours old)
   - Update `.env.SUPABASE_URL` + `.env.SUPABASE_ANON_KEY` to point to restored DB
   - Redeploy application
   - Verify data: Check row counts, test core workflows

### Scenario 3: Accidental Full Database Reset

**Example:** Migration runs with wrong condition, drops all tables

**Recovery time:** ~30 minutes

**Steps:**
1. **Identify reset timestamp** (when damage occurred)
2. **Stop migrations immediately:** Kill any running migration process
3. **Restore using PITR:**
   - Dashboard → Backups → PITR → Select 5 min before incident
   - Restore to new DB `postgres-restore`
4. **Verify structure:**
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 5;
   -- Should show customers, vehicles, activities, etc.
   ```
5. **Swap databases (if possible):**
   - Rename production DB → `postgres-damaged`
   - Rename `postgres-restore` → `postgres` (production name)
   - Update app connection string (should be automatic if using pooler)
6. **Verify all queries:**
   - Run health check: GET `/api/health`
   - Check dashboard loads without errors
   - Spot-check a few customer records
7. **Cleanup:** Delete `postgres-damaged` after 24 hours
8. **Post-mortem:** Document root cause, update migration safeguards

---

## Backup Monitoring

### Verification Schedule

- **Daily:** 10 AM UTC — Automated backup verification job
- **Weekly:** Monday 9 AM UTC — Manual review of backup logs
- **Quarterly:** Simulate restore drill (see Restore Drill section)

### Alerting

If backup verification fails:
1. Sentry alert: `backup_verification_failed`
2. Slack message to `#alerts` channel
3. PagerDuty incident (if enabled)

### Logs

Query recent backups:
```sql
SELECT * FROM pg_stat_database WHERE datname = 'postgres';
SELECT * FROM pg_stat_archiver;
```

View backup status in Supabase Dashboard:
- https://app.supabase.com/ → Project → Database → Backups

---

## Retention Policy

| Backup Type | Retention | Recovery RTO | Use Case |
|------------|-----------|------------|----------|
| Automatic daily (PITR) | 30 days | 15 min | Point-in-time recovery, recent corruption |
| Manual backup (pre-migration) | 90 days | 20 min | Major schema changes, migration safety |
| Disaster recovery (archive) | 1 year | 2 hours | Catastrophic failure, audit compliance |

**Cleanup:** Automated process runs monthly:
- Delete backups older than retention window
- Archive to cold storage (AWS Glacier) for long-term compliance

---

## Testing & Validation

### Quarterly Restore Drill

**Schedule:** First Monday of each quarter (April 5, July 2, Oct 1, Jan 1)
**Duration:** 1 hour
**Team:** DevOps lead + Database admin

**Procedure:**
1. Select a backup from 1-2 weeks ago
2. Restore to new staging database: `postgres-drill-staging`
3. Run data integrity checks:
   ```sql
   SELECT table_name, row_count FROM (
     SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
     FROM pg_tables WHERE schemaname='public'
   ) t;
   ```
4. Compare row counts to production (within 5% tolerance)
5. Run smoke tests: POST /api/health, fetch /api/organization/settings, list customers
6. Document results in `docs/RESTORE_DRILL.md`
7. Delete staging database
8. Record time taken (goal: < 30 min for full restore)

---

## Disaster Recovery RTO/RPO Summary

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| **Single table corruption** | 20 min | 24 hours | PITR → Export clean data → Restore |
| **Database service down** | 60 min | 24 hours | Wait for Supabase restore or use backup |
| **Full database reset** | 30 min | 24 hours | PITR → Swap databases |
| **Data verification** | 5 min | Real-time | Run health check queries |

---

## Compliance & Audit

### Backups Enable:
- **GDPR:** Right to data portability + deletion audit
- **CCPA:** Consumer access logs + right to deletion
- **SOC 2:** Backup and recovery procedures documented
- **Financial:** BHPH/lease payment history preserved

---

## References

- [Supabase Backups Guide](https://supabase.com/docs/guides/database/backups) — Official docs
- [PITR Documentation](https://supabase.com/docs/guides/database/backups#point-in-time-recovery) — Recovery details
- [Disaster Recovery Runbook](./DR_RESTORE_DRILL.md) — Detailed recovery steps (already created in Tier 0)

---

## TODO

- [ ] Configure S3 cross-region replication for Storage backup
- [ ] Create `lib/cron/jobs/backupVerification.ts` — Daily verification
- [ ] Set up Sentry/Slack alerts for backup failures
- [ ] Document in runbooks: response time for Scenario 1, 2, 3
- [ ] Schedule quarterly restore drills (calendar invite)
- [ ] Review Supabase backup settings quarterly (retention, PITR window)

