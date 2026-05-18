import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const TABLES = [
  'deleted_customers',
  'deleted_activities',
  'deleted_vehicles',
  'deleted_ledger_transactions',
] as const

export async function POST(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const summary: Record<string, number> = {}

  for (const table of TABLES) {
    const { data: expiredRows, error: fetchErr } = await supabase
      .from(table)
      .select('recovery_id, original_id, org_id')
      .lte('expires_at', now)
      .is('purged_at', null)
      .is('restored_at', null)
      .limit(500)

    if (fetchErr) {
      logger.error('cron:purge-recovery', fetchErr, { table })
      continue
    }

    if (!expiredRows?.length) {
      summary[table] = 0
      continue
    }

    const { error: purgeErr } = await supabase
      .from(table)
      .update({ purged_at: now })
      .lte('expires_at', now)
      .is('purged_at', null)
      .is('restored_at', null)

    if (purgeErr) {
      logger.error('cron:purge-recovery', purgeErr, { table })
      continue
    }

    const logRows = expiredRows.map(r => ({
      performed_by: '00000000-0000-0000-0000-000000000000', // system
      action: 'expire' as const,
      table_name: table.replace('deleted_', ''),
      recovery_id: r.recovery_id,
      original_id: r.original_id,
      org_id: r.org_id,
      metadata: { reason: 'auto_expire_7d' },
    }))

    const { error: logErr } = await supabase.from('org_data_recovery_log').insert(logRows)
    if (logErr) {
      logger.error('cron:purge-recovery', logErr, { table, op: 'insert_recovery_log' })
    }

    summary[table] = expiredRows.length
  }

  logger.info('cron:purge-recovery', 'Purge complete', { summary })
  return NextResponse.json({ ok: true, summary })
}

