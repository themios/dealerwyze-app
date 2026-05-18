# Database Backup — Cloudflare R2 Implementation Plan
_DealerWyze · Architect: Claude_
_Status: Ready for Cursor AI execution_

---

## Architecture

```
Supabase Postgres (production)
        │
        │  pg_dump (full schema + data)
        ▼
GitHub Actions (nightly cron, 3am UTC)
        │
        │  gzip compress → AES-256 encrypt
        ▼
Cloudflare R2 Bucket: dealerwyze-backups
        │
        ├── daily/2026-05-08/dealerwyze_2026-05-08.sql.gz.enc
        ├── daily/2026-05-07/dealerwyze_2026-05-07.sql.gz.enc
        ├── weekly/2026-W19/dealerwyze_2026-W19.sql.gz.enc
        └── monthly/2026-05/dealerwyze_2026-05.sql.gz.enc
        │
        ▼
Admin backup status page (/admin/backup-status)
reads R2 listing → shows last backup, size, age
```

**Why GitHub Actions instead of Vercel cron:**
- Vercel serverless functions cannot run `pg_dump` (no binary available)
- GitHub Actions runs full Ubuntu — `pg_dump` ships with `postgresql-client`
- GitHub Actions free tier: 2,000 min/month (this job takes ~2 min/run = 60 min/month)
- No cost, no extra infrastructure

**Why encryption:**
- Backup files contain full PII (customer names, phones, financial records)
- R2 bucket will have API token access — encrypting at rest means a leaked token alone isn't enough to read customer data
- Use AES-256-CBC via OpenSSL — standard, no extra packages needed

---

## SECTION 1 — Manual Setup Steps (Tim Does These)

### Step 1 — Create Cloudflare account / log in
Go to https://cloudflare.com → sign in or create a free account.

### Step 2 — Create the R2 bucket
1. In the Cloudflare dashboard left sidebar → click **R2 Object Storage**
2. Click **Create bucket**
3. Bucket name: `dealerwyze-backups`
4. Location: **Automatic** (Cloudflare picks the closest region)
5. Click **Create bucket**

### Step 3 — Create an R2 API Token
1. On the R2 overview page, click **Manage R2 API Tokens** (top right)
2. Click **Create API Token**
3. Fill in:
   - Token name: `dealerwyze-backup-writer`
   - Permissions: **Object Read & Write**
   - Specify bucket: ✅ check "Apply to specific bucket only" → select `dealerwyze-backups`
   - TTL: **No expiry**
4. Click **Create API Token**
5. **Copy and save immediately** (shown only once):
   - `Access Key ID` → save as `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → save as `R2_SECRET_ACCESS_KEY`

### Step 4 — Get your Cloudflare Account ID
1. On the R2 overview page, your **Account ID** is shown in the top-right panel
2. Save it as `R2_ACCOUNT_ID`
3. Your R2 endpoint will be: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

### Step 5 — Get your Supabase database URL
1. Go to your Supabase project dashboard
2. Left sidebar → **Project Settings** → **Database**
3. Scroll to **Connection string** → select **URI** tab
4. Copy the URI — it looks like:
   `postgresql://postgres:{YOUR_DB_PASSWORD}@db.{PROJECT_REF}.supabase.co:5432/postgres`
5. Save as `SUPABASE_DB_URL`

   ⚠️ Use the **direct connection** URI (port 5432), NOT the connection pooler (port 6543). pg_dump requires a direct connection.

### Step 6 — Create the backup encryption passphrase
Generate a strong random passphrase (32+ chars). Save it as `BACKUP_ENCRYPTION_KEY`.
You can generate one by running this in your terminal:
```bash
openssl rand -base64 32
```
Store this in 1Password or your password manager — **you cannot decrypt backups without it**.

### Step 7 — Add secrets to GitHub repository
1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each:

| Secret name | Value |
|---|---|
| `SUPABASE_DB_URL` | The postgresql:// URI from Step 5 |
| `R2_ACCESS_KEY_ID` | From Step 3 |
| `R2_SECRET_ACCESS_KEY` | From Step 3 |
| `R2_ACCOUNT_ID` | From Step 4 |
| `R2_BUCKET_NAME` | `dealerwyze-backups` |
| `BACKUP_ENCRYPTION_KEY` | From Step 6 |

### Step 8 — Verify bucket access (optional sanity check)
After Cursor implements the workflow, you can manually trigger it in GitHub → Actions → db-backup → Run workflow to confirm the first backup uploads successfully before relying on the nightly schedule.

---

## SECTION 2 — Code Implementation (Cursor Does These)

### Task B1 — GitHub Actions backup workflow

Create `.github/workflows/db-backup.yml`:

```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 3 * * *'   # 3am UTC daily
  workflow_dispatch:        # allow manual trigger from GitHub UI

jobs:
  backup:
    name: pg_dump → R2
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Install postgresql-client
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y postgresql-client

      - name: Set timestamp variables
        id: ts
        run: |
          echo "DATE=$(date -u +%Y-%m-%d)" >> $GITHUB_OUTPUT
          echo "DATETIME=$(date -u +%Y-%m-%d_%H-%M)" >> $GITHUB_OUTPUT
          echo "WEEK=$(date -u +%Y-W%V)" >> $GITHUB_OUTPUT
          echo "MONTH=$(date -u +%Y-%m)" >> $GITHUB_OUTPUT
          echo "DOW=$(date -u +%u)" >> $GITHUB_OUTPUT   # 1=Mon 7=Sun
          echo "DOM=$(date -u +%-d)" >> $GITHUB_OUTPUT  # day of month 1-31

      - name: Run pg_dump
        env:
          PGPASSWORD: ""   # password embedded in URL
        run: |
          pg_dump \
            --dbname="${{ secrets.SUPABASE_DB_URL }}" \
            --format=plain \
            --inserts \
            --no-owner \
            --no-acl \
            --clean \
            --if-exists \
            > /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql
          # --inserts writes one INSERT per row instead of COPY blocks.
          # Required so restore.sh can grep for individual records/orgs.

      - name: Compress and encrypt
        run: |
          gzip -9 /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql
          openssl enc -aes-256-cbc \
            -pbkdf2 \
            -iter 100000 \
            -in  /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz \
            -out /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc \
            -pass pass:${{ secrets.BACKUP_ENCRYPTION_KEY }}
          rm /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz

      - name: Upload daily backup to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp \
            /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc \
            s3://${{ secrets.R2_BUCKET_NAME }}/daily/${{ steps.ts.outputs.DATE }}/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Upload weekly backup (Sundays only)
        if: steps.ts.outputs.DOW == '7'
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp \
            /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc \
            s3://${{ secrets.R2_BUCKET_NAME }}/weekly/${{ steps.ts.outputs.WEEK }}/dealerwyze_${{ steps.ts.outputs.WEEK }}.sql.gz.enc \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Upload monthly backup (1st of month only)
        if: steps.ts.outputs.DOM == '1'
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp \
            /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc \
            s3://${{ secrets.R2_BUCKET_NAME }}/monthly/${{ steps.ts.outputs.MONTH }}/dealerwyze_${{ steps.ts.outputs.MONTH }}.sql.gz.enc \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Prune old daily backups (keep 7 days)
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          CUTOFF=$(date -u -d '7 days ago' +%Y-%m-%d)
          aws s3 ls \
            s3://${{ secrets.R2_BUCKET_NAME }}/daily/ \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com \
          | awk '{print $2}' \
          | while read folder; do
              folder_date="${folder%/}"
              if [[ "$folder_date" < "$CUTOFF" ]]; then
                echo "Pruning old daily: $folder_date"
                aws s3 rm \
                  s3://${{ secrets.R2_BUCKET_NAME }}/daily/$folder_date/ \
                  --recursive \
                  --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
              fi
            done

      - name: Prune old weekly backups (keep 4 weeks)
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          CUTOFF_WEEK=$(date -u -d '28 days ago' +%Y-W%V)
          aws s3 ls \
            s3://${{ secrets.R2_BUCKET_NAME }}/weekly/ \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com \
          | awk '{print $2}' \
          | while read folder; do
              folder_week="${folder%/}"
              if [[ "$folder_week" < "$CUTOFF_WEEK" ]]; then
                echo "Pruning old weekly: $folder_week"
                aws s3 rm \
                  s3://${{ secrets.R2_BUCKET_NAME }}/weekly/$folder_week/ \
                  --recursive \
                  --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
              fi
            done

      - name: Write backup status file
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          FILE_SIZE=$(stat -c%s /tmp/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc)
          echo "{\"last_backup_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"file\":\"daily/${{ steps.ts.outputs.DATE }}/dealerwyze_${{ steps.ts.outputs.DATETIME }}.sql.gz.enc\",\"size_bytes\":$FILE_SIZE,\"status\":\"success\"}" \
            > /tmp/backup-status.json
          aws s3 cp \
            /tmp/backup-status.json \
            s3://${{ secrets.R2_BUCKET_NAME }}/status.json \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Cleanup temp files
        if: always()
        run: |
          rm -f /tmp/dealerwyze_*.sql \
                /tmp/dealerwyze_*.sql.gz \
                /tmp/dealerwyze_*.sql.gz.enc \
                /tmp/backup-status.json

      - name: Notify on failure
        if: failure()
        run: |
          echo "::error::Database backup FAILED for ${{ steps.ts.outputs.DATE }}"
          # Extend here: POST to a Telegram or Slack webhook if desired
          # curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
          #   -d "chat_id=${TELEGRAM_CHAT_ID}" \
          #   -d "text=⚠️ DealerWyze DB backup FAILED on ${{ steps.ts.outputs.DATE }}"
```

### Task B2 — Add env vars to `.env.example`

Add the following section:

```
# ─── Cloudflare R2 Backup ─────────────────────────────────────────────────────
# Configured as GitHub Actions secrets — NOT Vercel env vars.
# These are documented here for reference only. See .planning/BACKUP_PLAN.md.
# R2_ACCOUNT_ID=your-cloudflare-account-id
# R2_ACCESS_KEY_ID=your-r2-access-key-id
# R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
# R2_BUCKET_NAME=dealerwyze-backups
# BACKUP_ENCRYPTION_KEY=your-aes256-passphrase   # store in 1Password — required to decrypt

# Vercel env var — used by admin backup status page to read R2 listing:
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=dealerwyze-backups
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

### Task B3 — Admin API: read backup status from R2

Install `@aws-sdk/client-s3` (S3-compatible, works with R2):
```bash
npm install @aws-sdk/client-s3
```

Create `lib/backup/r2Client.ts`:

```ts
import { S3Client } from '@aws-sdk/client-s3'

// R2 is S3-compatible — just swap the endpoint
export function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) return null

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  })
}
```

Create `app/api/admin/backup-status/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createR2Client } from '@/lib/backup/r2Client'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const r2 = createR2Client()
  const bucket = process.env.R2_BUCKET_NAME

  if (!r2 || !bucket) {
    return NextResponse.json({ configured: false })
  }

  try {
    // Read the status.json written by the backup job
    const statusObj = await r2.send(new GetObjectCommand({
      Bucket: bucket,
      Key: 'status.json',
    }))
    const statusText = await statusObj.Body?.transformToString()
    const status = statusText ? JSON.parse(statusText) : null

    // List recent daily backups
    const list = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'daily/',
      MaxKeys: 30,
    }))

    // List weekly backups
    const weekly = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'weekly/',
      MaxKeys: 10,
    }))

    // List monthly backups
    const monthly = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'monthly/',
      MaxKeys: 12,
    }))

    return NextResponse.json({
      configured: true,
      last_backup: status,
      daily_count: list.Contents?.length ?? 0,
      weekly_count: weekly.Contents?.length ?? 0,
      monthly_count: monthly.Contents?.length ?? 0,
      daily_files: (list.Contents ?? [])
        .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
        .slice(0, 10)
        .map(f => ({
          key: f.Key,
          size_bytes: f.Size,
          last_modified: f.LastModified?.toISOString(),
        })),
    })
  } catch (err) {
    // No status.json yet = no backups run yet
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('NoSuchKey') || msg.includes('404')) {
      return NextResponse.json({ configured: true, last_backup: null, daily_count: 0 })
    }
    return NextResponse.json({ error: 'Failed to read backup status' }, { status: 500 })
  }
}
```

### Task B4 — Admin Backup Status page

Create `app/(app)/admin/backup-status/page.tsx` (client component):

```
Layout:

┌─────────────────────────────────────────────────────────┐
│ ← Back   Backup Status                      [Refresh]  │
├─────────────────────────────────────────────────────────┤
│ Last Backup          Size          Age                  │
│ May 8, 2026 3:00am   42.3 MB      8 hours ago          │
├─────────────────────────────────────────────────────────┤
│ Storage: Cloudflare R2 · dealerwyze-backups             │
│ Retention: 7 daily · 4 weekly · 12 monthly              │
│ Encryption: AES-256-CBC                                 │
├─────────────────────────────────────────────────────────┤
│ Recent Daily Backups                                    │
│ ─────────────────────────────────────────────────────── │
│ ✅ 2026-05-08   42.3 MB   8 hours ago                   │
│ ✅ 2026-05-07   41.9 MB   1 day ago                     │
│ ✅ 2026-05-06   41.8 MB   2 days ago                    │
│ ✅ 2026-05-05   41.7 MB   3 days ago                    │
│ ...                                                     │
├─────────────────────────────────────────────────────────┤
│ ⚠️  R2 not configured                                   │  ← shown when no env vars
│ Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,│
│ R2_BUCKET_NAME to Vercel environment variables.         │
└─────────────────────────────────────────────────────────┘
```

UI requirements:
- Last backup card: show `last_backup.last_backup_at` humanized, `last_backup.size_bytes` formatted as MB, age from now
- Age color: green < 25h, amber 25-49h, red ≥ 50h (means backup missed a day)
- "No backup yet" state when `last_backup === null`
- Daily files list: each row shows date parsed from key, size in MB, age humanized. Green checkmark icon per row.
- Not configured state: yellow banner with setup instructions referencing BACKUP_PLAN.md
- "Refresh" button re-fetches
- Link to GitHub Actions: `https://github.com/{org}/{repo}/actions/workflows/db-backup.yml` — show as "View backup job logs →" (use a hardcoded link or make it an env var `NEXT_PUBLIC_GITHUB_REPO_URL`)

### Task B5 — Add Backup Status card to admin dashboard

In `app/(app)/admin/page.tsx`, add a fourth observability card alongside the Platform Health and Feature Adoption cards from ADMIN_OBSERVABILITY_PLAN.md:

```
Icon: DatabaseBackup or HardDrive (lucide)   Color: emerald-100 / emerald-600
Title: Backup Status
Subtitle:  dynamic — fetch from /api/admin/backup-status
  → If last backup < 25h ago: "Last backup 8 hours ago · healthy"
  → If last backup 25-49h: "Last backup 30 hours ago · check logs"  (amber)
  → If last backup ≥ 50h or error: "Backup overdue — check GitHub Actions"  (red)
  → If not configured: "R2 not configured"  (yellow)
Link: /admin/backup-status
```

Fetch the backup status alongside the other admin dashboard data. Handle loading and error states gracefully — a failed R2 fetch must never break the admin dashboard render.

### Task B6 — Add Backup Status to admin nav (Phase 4 Q1 extension)

In the same nav task as ADMIN_OBSERVABILITY_PLAN.md Q1, add:
- `/admin/backup-status` — "Backup Status"

---

## SECTION 3 — Restore Procedure (Documentation Only — No Code)

Create `docs/BACKUP_RESTORE.md` with the following content:

```markdown
# Database Restore Procedure

## When to use this
- Catastrophic data loss (table drop, migration gone wrong, Supabase incident)
- NOT for single-record recovery — use the Data Recovery admin page instead

## Step 1 — Download the backup file
From the Admin dashboard → Backup Status → identify the backup file to restore.

Or from Cloudflare R2 dashboard:
  1. Go to cloudflare.com → R2 → dealerwyze-backups
  2. Navigate to daily/{date}/ or weekly/ or monthly/
  3. Download the .sql.gz.enc file

## Step 2 — Decrypt the backup
You need the BACKUP_ENCRYPTION_KEY from 1Password.

```bash
openssl enc -d -aes-256-cbc \
  -pbkdf2 \
  -iter 100000 \
  -in  dealerwyze_2026-05-08_03-00.sql.gz.enc \
  -out dealerwyze_2026-05-08_03-00.sql.gz \
  -pass pass:YOUR_ENCRYPTION_KEY
```

## Step 3 — Decompress
```bash
gunzip dealerwyze_2026-05-08_03-00.sql.gz
# Produces: dealerwyze_2026-05-08_03-00.sql
```

## Step 4 — Restore to Supabase
⚠️ This overwrites the current database. Do this on a test project first.

Option A: Restore to a new Supabase project (recommended for testing):
  1. Create a new Supabase project
  2. Get its DB URL from Settings → Database → URI
  3. psql {NEW_DB_URL} < dealerwyze_2026-05-08_03-00.sql

Option B: Restore to production (emergency only):
  1. Notify all users of maintenance window
  2. psql {SUPABASE_DB_URL} < dealerwyze_2026-05-08_03-00.sql
  3. Verify RLS policies are intact after restore
  4. Run: SELECT count(*) FROM organizations; to confirm data

## Step 5 — Verify after restore
- Log in as a test dealer, verify data is present
- Check that Supabase RLS policies are enabled on all tables
- Run the app health check: GET /api/health
```

---

## Retention Policy Summary

| Tier | Frequency | Kept for | Approx. files in R2 |
|---|---|---|---|
| Daily | Every day 3am UTC | 7 days | 7 files |
| Weekly | Every Sunday | 4 weeks | 4 files |
| Monthly | 1st of each month | 12 months | 12 files |
| **Total** | | | **~23 files** |

At ~40MB per encrypted backup, total R2 storage used ≈ **~1GB** — well within the free 10GB tier.

---

## Completion Report Template

Append to `ADMIN_OBSERVABILITY_REPORT.md` or create `BACKUP_REPORT.md`:

```markdown
# Backup Implementation Report

## ✅ Implemented as Specified
- [ Task ID ] — [description]

## ⚠️ Deviations
- [ Task ID ] — DEVIATION: [reason]

## ❌ Skipped
- [ Task ID ] — [reason]

## 🔒 Security Checklist
- [ ] BACKUP_ENCRYPTION_KEY is a GitHub secret — never in code or Vercel env
- [ ] R2 token is scoped to single bucket (Object Read & Write only)
- [ ] Temp files deleted in `if: always()` step (even on failure)
- [ ] status.json written after every successful backup
- [ ] Admin backup-status route calls canAccessAdminArea()
- [ ] R2 credentials never returned to client side
- [ ] docs/BACKUP_RESTORE.md created with decrypt + restore steps
- [ ] npm run build — PASS / FAIL

## 🔧 Manual Steps Required (Tim)
1. Complete Cloudflare R2 setup per BACKUP_PLAN.md Section 1 (Steps 1–7)
2. Add R2 credentials as GitHub Actions secrets (Step 7)
3. Add R2 credentials to Vercel env vars for admin status page
4. Trigger first manual backup: GitHub → Actions → Database Backup → Run workflow
5. Verify backup appears in R2 dashboard
6. Verify backup-status page shows correct last backup time
7. Store BACKUP_ENCRYPTION_KEY in 1Password under "DealerWyze Backup Key"
```
