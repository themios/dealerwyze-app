import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Search term must be at least 2 characters' }, { status: 400 })
  }

  const limitRaw = searchParams.get('limit')
  const limit = Math.min(50, Math.max(1, Number(limitRaw ?? 20) || 20))

  // Service role required: cross-tenant deleted customers search across all orgs.
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('deleted_customers')
    .select('recovery_id, original_id, org_id, deleted_at, expires_at, row_data, restored_at, purged_at')
    .is('purged_at', null)
    .or(`row_data->>'name'.ilike.%${q}%,row_data->>'phone'.ilike.%${q}%`)
    .order('deleted_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  const orgIds = [...new Set((data ?? []).map(r => r.org_id))]
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds)

  const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name]))

  const results = (data ?? []).map(r => {
    const rowData = r.row_data as Record<string, unknown>
    return {
      ...r,
      org_name: orgMap.get(r.org_id) ?? 'Unknown org',
      customer_name: typeof rowData?.name === 'string' ? rowData.name : '—',
      customer_phone: typeof rowData?.phone === 'string' ? rowData.phone : '—',
    }
  })

  return NextResponse.json({ results })
}

