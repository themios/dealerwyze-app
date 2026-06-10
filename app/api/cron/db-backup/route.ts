import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { runDbBackup } from '@/lib/cron/jobs/dbBackup'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  try {
    const result = await runDbBackup()
    return NextResponse.json({
      ok: true,
      tables: result.tables,
      rows: result.rows,
      size_bytes: result.sizeBytes,
      pruned: result.pruned,
      redundant: result.redundant,
    })
  } catch (err) {
    console.error('[db-backup] failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'backup failed' },
      { status: 500 }
    )
  }
}
