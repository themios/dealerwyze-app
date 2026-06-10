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

function makeR2(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_BACKUP_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_BACKUP_SECRET_ACCESS_KEY!,
    },
  })
}

async function listPublicTables(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_backup_tables')
  if (error) throw new Error(`listPublicTables failed: ${error.message}`)
  return (data as { table_name: string }[]).map(r => r.table_name)
}

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

// Matches: openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass pass:KEY
// Output format: "Salted__" (8 bytes) + salt (8 bytes) + ciphertext
function encryptBuffer(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(8)
  // PBKDF2 with SHA-256, 100k iterations → 48 bytes: [0..31]=key, [32..47]=iv
  const derived = pbkdf2Sync(passphrase, salt, 100000, 48, 'sha256')
  const key = derived.subarray(0, 32)
  const iv = derived.subarray(32, 48)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([Buffer.from('Salted__'), salt, encrypted])
}

async function pruneOldDailies(r2: S3Client, todayStr: string): Promise<number> {
  const cutoff = new Date(todayStr)
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const listed = await r2.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME!,
    Prefix: 'daily/',
    Delimiter: '/',
  }))

  const oldDirs = (listed.CommonPrefixes ?? [])
    .map(p => p.Prefix?.replace('daily/', '').replace('/', '') ?? '')
    .filter(d => d.length === 10 && d < cutoffStr)

  let deleted = 0
  for (const dir of oldDirs) {
    const objects = await r2.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME!,
      Prefix: `daily/${dir}/`,
    }))
    const keys = (objects.Contents ?? []).map(o => ({ Key: o.Key! })).filter(o => o.Key)
    if (keys.length > 0) {
      await r2.send(new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Delete: { Objects: keys },
      }))
      deleted += keys.length
    }
  }

  return deleted
}

export async function runDbBackup(): Promise<{
  tables: number
  rows: number
  sizeBytes: number
  pruned: number
}> {
  const encKey = process.env.BACKUP_ENCRYPTION_KEY
  if (!encKey) throw new Error('BACKUP_ENCRYPTION_KEY not set')
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME) throw new Error('R2 env vars not set')

  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)                        // 2026-06-10
  const datetimeStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-') // 2026-06-10_03-00
  const dow = now.getUTCDay()  // 0=Sun
  const dom = now.getUTCDate()

  // 1. Discover tables
  const tables = await listPublicTables()

  // 2. Export all tables row by row
  const backup: Record<string, Record<string, unknown>[]> = {}
  let totalRows = 0

  for (const table of tables) {
    const rows = await exportTable(table)
    backup[table] = rows
    totalRows += rows.length
  }

  // 3. Serialize → compress → encrypt
  const payload = JSON.stringify({
    exported_at: now.toISOString(),
    project: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? 'unknown',
    table_count: tables.length,
    row_count: totalRows,
    tables: backup,
  })
  const compressed = await gzip(Buffer.from(payload, 'utf8'), { level: 9 })
  const encrypted = encryptBuffer(compressed, encKey)

  const r2 = makeR2()
  const filename = `dealerwyze_${datetimeStr}.json.gz.enc`

  // 4. Always upload daily
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: `daily/${dateStr}/${filename}`,
    Body: encrypted,
    ContentType: 'application/octet-stream',
  }))

  // 5. Weekly copy (Sunday)
  if (dow === 0) {
    const week = `${now.getUTCFullYear()}-W${String(Math.ceil(dom / 7)).padStart(2, '0')}`
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: `weekly/${week}/dealerwyze_${week}.json.gz.enc`,
      Body: encrypted,
      ContentType: 'application/octet-stream',
    }))
  }

  // 6. Monthly copy (1st of month)
  if (dom === 1) {
    const month = now.toISOString().slice(0, 7)
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: `monthly/${month}/dealerwyze_${month}.json.gz.enc`,
      Body: encrypted,
      ContentType: 'application/octet-stream',
    }))
  }

  // 7. Write status file
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: 'status.json',
    Body: JSON.stringify({
      last_backup_at: now.toISOString(),
      file: `daily/${dateStr}/${filename}`,
      size_bytes: encrypted.length,
      tables: tables.length,
      rows: totalRows,
      status: 'success',
      method: 'vercel-cron',
    }),
    ContentType: 'application/json',
  }))

  // 8. Prune dailies older than 7 days
  const pruned = await pruneOldDailies(r2, dateStr)

  return { tables: tables.length, rows: totalRows, sizeBytes: encrypted.length, pruned }
}
