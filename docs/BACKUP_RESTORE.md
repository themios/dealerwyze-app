# Backup & Restore (Cloudflare R2)

DealerWyze runs nightly database backups via GitHub Actions using `pg_dump`, then compresses and encrypts the dump before uploading to Cloudflare R2.

## What gets backed up

- **Postgres schema + data** (full dump) from production Supabase
- Output format: `.sql.gz.enc` (gzip + AES-256-CBC encryption)

## Where backups live

In the R2 bucket `dealerwyze-backups`:

- `daily/YYYY-MM-DD/dealerwyze_YYYY-MM-DD_HH-MM.sql.gz.enc`
- `weekly/YYYY-W##/dealerwyze_YYYY-W##.sql.gz.enc` (Sundays)
- `monthly/YYYY-MM/dealerwyze_YYYY-MM.sql.gz.enc` (1st of month)

## Restore procedure (manual)

### Preconditions

- You must have:
  - The encrypted backup file (`.sql.gz.enc`)
  - The **backup encryption passphrase** (`BACKUP_ENCRYPTION_KEY`) from GitHub Actions secrets
  - A safe restore target (recommended: a new Supabase project or a dedicated restore database)

### Step 1 — Download the encrypted backup from R2

Use the Cloudflare dashboard or AWS CLI (S3 compatible):

```bash
aws s3 cp \
  "s3://dealerwyze-backups/daily/2026-05-08/dealerwyze_2026-05-08_03-00.sql.gz.enc" \
  ./backup.sql.gz.enc \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

### Step 2 — Decrypt

```bash
openssl enc -d -aes-256-cbc \
  -pbkdf2 \
  -iter 100000 \
  -in  ./backup.sql.gz.enc \
  -out ./backup.sql.gz \
  -pass pass:"$BACKUP_ENCRYPTION_KEY"
```

### Step 3 — Decompress

```bash
gzip -d ./backup.sql.gz
```

### Step 4 — Restore into Postgres

⚠️ Restoring into production will overwrite data. Prefer restoring into a fresh database first.

```bash
psql "$SUPABASE_DB_URL" -f ./backup.sql
```

## How to verify backups

- In GitHub: Actions → **Database Backup** → verify last run succeeded.
- In-app: `/admin/backup-status` should show the latest daily/weekly/monthly object keys and timestamps.

