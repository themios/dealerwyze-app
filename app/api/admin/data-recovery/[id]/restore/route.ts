import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const TABLE_MAP: Record<string, string> = {
  deleted_customers: 'customers',
  deleted_activities: 'activities',
  deleted_vehicles: 'vehicles',
  deleted_ledger_transactions: 'ledger_transactions',
}

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

  const sourceTable = TABLE_MAP[archiveTable]
  if (!sourceTable) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: archived, error: fetchErr } = await supabase
    .from(archiveTable)
    .select('*')
    .eq('recovery_id', recoveryId)
    .is('purged_at', null)
    .is('restored_at', null)
    .single()

  if (fetchErr || !archived) {
    return NextResponse.json({ error: 'Recovery record not found or already processed' }, { status: 404 })
  }

  if (new Date(archived.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'Recovery window has expired' }, { status: 410 })
  }

  const rowData = { ...(archived.row_data as Record<string, unknown>) }
  rowData.id = archived.original_id

  const { error: insertErr } = await supabase.from(sourceTable).insert(rowData)
  if (insertErr) {
    return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  }

  await supabase
    .from(archiveTable)
    .update({ restored_at: new Date().toISOString() })
    .eq('recovery_id', recoveryId)

  await writeAuditLog({
    action: 'data_restored',
    actorType: 'staff',
    actorId: profile.id,
    orgId: archived.org_id,
    entityType: sourceTable,
    entityId: archived.original_id,
    metadata: { archive_table: archiveTable, recovery_id: recoveryId },
  })

  await supabase.from('org_data_recovery_log').insert({
    performed_by: profile.id,
    action: 'restore',
    table_name: sourceTable,
    recovery_id: recoveryId,
    original_id: archived.original_id,
    org_id: archived.org_id,
  })

  return NextResponse.json({ ok: true, restored_id: archived.original_id })
}

