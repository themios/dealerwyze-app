import { createServiceClient } from '@/lib/supabase/service'
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { gzip as gzipCb } from 'zlib'
import { promisify } from 'util'
import { createCipheriv, randomBytes, pbkdf2Sync } from 'crypto'

const gzip = promisify(gzipCb)

const PAGE_SIZE = 1000

// ── R2 clients ────────────────────────────────────────────────────────────────

function makePrimaryR2(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_BACKUP_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_BACKUP_SECRET_ACCESS_KEY!,
    },
  })
}

// Secondary bucket for redundancy — optional, skipped if env vars not set
function makeSecondaryR2(): S3Client | null {
  const accountId = process.env.R2_BACKUP_SECONDARY_ACCOUNT_ID
  const keyId = process.env.R2_BACKUP_SECONDARY_ACCESS_KEY_ID
  const secret = process.env.R2_BACKUP_SECONDARY_SECRET_ACCESS_KEY
  if (!accountId || !keyId || !secret) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  })
}

// ── Table discovery ───────────────────────────────────────────────────────────

async function listPublicTables(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_backup_tables')
  if (error) throw new Error(`listPublicTables failed: ${error.message}`)
  return (data as { table_name: string }[]).map(r => r.table_name)
}

// ── Data export ───────────────────────────────────────────────────────────────

async function exportTable(tableName: string): Promise<Record<string, unknown>[]> {
  const supabase = createServiceClient()
  const rows: Record<string, unknown>[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Export failed for ${tableName}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

// ── SQL generation ────────────────────────────────────────────────────────────
// Produces INSERT statements compatible with pg_dump --inserts format.
// restore.sh can grep/awk these just like a real pg_dump output.

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  // JSON columns (objects/arrays) — cast to jsonb
  return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'::jsonb`
}

function tableToSql(tableName: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- ${tableName}: 0 rows\n`

  const cols = Object.keys(rows[0])
  const colList = cols.map(c => `"${c}"`).join(', ')
  const lines: string[] = [`-- Table: ${tableName} (${rows.length} rows)`]

  for (const row of rows) {
    const vals = cols.map(c => sqlLiteral(row[c])).join(', ')
    lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;`)
  }

  return lines.join('\n') + '\n'
}

// ── Encryption ────────────────────────────────────────────────────────────────
// Matches: openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass pass:KEY
// Output: "Salted__" (8 bytes) + salt (8 bytes) + ciphertext

function encryptBuffer(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(8)
  const derived = pbkdf2Sync(passphrase, salt, 100000, 48, 'sha256')
  const key = derived.subarray(0, 32)
  const iv = derived.subarray(32, 48)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([Buffer.from('Salted__'), salt, encrypted])
}

// ── R2 upload helpers ─────────────────────────────────────────────────────────

async function upload(
  r2: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
): Promise<void> {
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/octet-stream',
  }))
}

async function uploadToAll(
  primary: S3Client,
  secondary: S3Client | null,
  key: string,
  body: Buffer,
): Promise<{ primary: boolean; secondary: boolean }> {
  const primaryBucket = process.env.R2_BUCKET_NAME!
  const secondaryBucket = process.env.R2_BACKUP_SECONDARY_BUCKET_NAME

  const results = await Promise.allSettled([
    upload(primary, primaryBucket, key, body),
    secondary && secondaryBucket
      ? upload(secondary, secondaryBucket, key, body)
      : Promise.resolve(),
  ])

  return {
    primary: results[0].status === 'fulfilled',
    secondary: secondary !== null && results[1].status === 'fulfilled',
  }
}

// ── Pruning ───────────────────────────────────────────────────────────────────

async function pruneOldDailies(r2: S3Client, bucket: string, todayStr: string): Promise<number> {
  const cutoff = new Date(todayStr)
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const listed = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'daily/', Delimiter: '/' }))

  const oldDirs = (listed.CommonPrefixes ?? [])
    .map(p => p.Prefix?.replace('daily/', '').replace('/', '') ?? '')
    .filter(d => d.length === 10 && d < cutoffStr)

  let deleted = 0
  for (const dir of oldDirs) {
    const objects = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `daily/${dir}/` }))
    const keys = (objects.Contents ?? []).map(o => ({ Key: o.Key! })).filter(o => o.Key)
    if (keys.length > 0) {
      await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }))
      deleted += keys.length
    }
  }

  return deleted
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runDbBackup(): Promise<{
  tables: number
  rows: number
  sizeBytes: number
  pruned: number
  redundant: boolean
}> {
  const encKey = process.env.BACKUP_ENCRYPTION_KEY
  if (!encKey) throw new Error('BACKUP_ENCRYPTION_KEY not set')
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME) throw new Error('R2 env vars not set')

  const now = new Date()
  const dateStr     = now.toISOString().slice(0, 10)
  const datetimeStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const dow = now.getUTCDay()   // 0=Sun
  const dom = now.getUTCDate()

  // 1. Discover tables
  const tables = await listPublicTables()

  // 2. Export all tables
  let totalRows = 0
  const sqlChunks: string[] = [
    `-- DealerWyze database backup`,
    `-- Exported: ${now.toISOString()}`,
    `-- Tables: ${tables.length}`,
    `-- Generated by Vercel cron /api/cron/db-backup`,
    `-- Restore: scripts/restore.sh`,
    ``,
    `SET session_replication_role = replica; -- disable FK checks during restore`,
    ``,
  ]

  for (const table of tables) {
    const rows = await exportTable(table)
    totalRows += rows.length
    sqlChunks.push(tableToSql(table, rows))
  }

  sqlChunks.push(`SET session_replication_role = DEFAULT;`)
  const sql = sqlChunks.join('\n')

  // 3. Compress → encrypt
  const compressed = await gzip(Buffer.from(sql, 'utf8'), { level: 9 })
  const encrypted  = encryptBuffer(compressed, encKey)

  const primary   = makePrimaryR2()
  const secondary = makeSecondaryR2()
  const primaryBucket = process.env.R2_BUCKET_NAME!
  const filename  = `dealerwyze_${datetimeStr}.sql.gz.enc`

  // 4. Daily backup → both destinations
  const dailyKey = `daily/${dateStr}/${filename}`
  const dailyResult = await uploadToAll(primary, secondary, dailyKey, encrypted)

  // 5. Weekly (Sunday)
  if (dow === 0) {
    const week = `${now.getUTCFullYear()}-W${String(Math.ceil(dom / 7)).padStart(2, '0')}`
    await uploadToAll(primary, secondary, `weekly/${week}/dealerwyze_${week}.sql.gz.enc`, encrypted)
  }

  // 6. Monthly (1st of month)
  if (dom === 1) {
    const month = now.toISOString().slice(0, 7)
    await uploadToAll(primary, secondary, `monthly/${month}/dealerwyze_${month}.sql.gz.enc`, encrypted)
  }

  // 7. Status file (primary only)
  await primary.send(new PutObjectCommand({
    Bucket: primaryBucket,
    Key: 'status.json',
    Body: JSON.stringify({
      last_backup_at: now.toISOString(),
      file: dailyKey,
      size_bytes: encrypted.length,
      tables: tables.length,
      rows: totalRows,
      status: 'success',
      method: 'vercel-cron',
      redundant: dailyResult.secondary,
    }),
    ContentType: 'application/json',
  }))

  // 8. Prune primary dailies (secondary self-manages or mirrors retention)
  const pruned = await pruneOldDailies(primary, primaryBucket, dateStr)

  return {
    tables: tables.length,
    rows: totalRows,
    sizeBytes: encrypted.length,
    pruned,
    redundant: dailyResult.secondary,
  }
}
