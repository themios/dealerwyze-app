import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const VALID = [
  'deleted_customers',
  'deleted_activities',
  'deleted_vehicles',
  'deleted_ledger_transactions',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: recoveryId } = await params
  const { searchParams } = new URL(req.url)
  const archiveTable = searchParams.get('table') ?? ''

  if (!VALID.includes(archiveTable)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: archived, error: fetchErr } = await supabase
    .from(archiveTable)
    .select('recovery_id, original_id, org_id')
    .eq('recovery_id', recoveryId)
    .is('purged_at', null)
    .is('restored_at', null)
    .single()

  if (fetchErr || !archived) {
    return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 })
  }

  await supabase
    .from(archiveTable)
    .update({ purged_at: new Date().toISOString() })
    .eq('recovery_id', recoveryId)

  await writeAuditLog({
    action: 'data_purged',
    actorType: 'staff',
    actorId: profile.id,
    orgId: archived.org_id,
    entityType: archiveTable,
    entityId: archived.original_id,
    metadata: { reason: 'admin_manual_purge', archive_table: archiveTable, recovery_id: recoveryId },
  })

  await supabase.from('org_data_recovery_log').insert({
    performed_by: profile.id,
    action: 'purge',
    table_name: archiveTable.replace('deleted_', ''),
    recovery_id: recoveryId,
    original_id: archived.original_id,
    org_id: archived.org_id,
    metadata: { reason: 'admin_manual_purge' },
  })

  return NextResponse.json({ ok: true })
}

