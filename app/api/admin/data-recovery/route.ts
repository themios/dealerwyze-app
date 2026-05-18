import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const VALID_TABLES = [
  'deleted_customers',
  'deleted_activities',
  'deleted_vehicles',
  'deleted_ledger_transactions',
] as const
type RecoveryTable = (typeof VALID_TABLES)[number]

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('org_id') ?? ''
  const tableParam = (searchParams.get('table') ?? 'deleted_customers') as RecoveryTable
  const limitParam = Number(searchParams.get('limit') ?? '50')

  if (!isUuid(orgId)) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
  if (!VALID_TABLES.includes(tableParam)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, Math.floor(limitParam))) : 50

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from(tableParam)
    .select('recovery_id, original_id, org_id, deleted_at, expires_at, row_data, restored_at, purged_at')
    .eq('org_id', orgId)
    .is('purged_at', null)
    .order('deleted_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: 'Failed to load recovery records' }, { status: 500 })

  return NextResponse.json({ records: data ?? [] })
}

