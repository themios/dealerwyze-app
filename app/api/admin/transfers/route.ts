import { NextResponse } from 'next/server'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

// GET — list all pending transfers for SuperAdmin review
export async function GET() {
  await requirePlatformSuperAdmin()
  const supabase = createServiceClient()

  const { data: transfers, error } = await supabase
    .from('business_transfers')
    .select('id, org_id, new_owner_email, status, data_snapshot, notes, created_at, token_expires_at, initiated_by, new_owner_user_id')
    .in('status', ['pending_claim', 'pending_approval'])
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 })
  }

  if (!transfers?.length) return NextResponse.json({ transfers: [] })

  // Collect all profile IDs to look up in one query
  const profileIds = Array.from(new Set([
    ...transfers.map(t => t.initiated_by),
    ...transfers.map(t => t.new_owner_user_id).filter(Boolean),
  ])) as string[]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', profileIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Fetch org names
  const orgIds = Array.from(new Set(transfers.map(t => t.org_id)))
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds)

  const orgMap = Object.fromEntries((orgs ?? []).map(o => [o.id, o.name]))

  const enriched = transfers.map(t => ({
    ...t,
    org_name:          orgMap[t.org_id] ?? 'Unknown',
    initiated_by_name: profileMap[t.initiated_by]?.full_name ?? 'Unknown',
    initiated_by_email:profileMap[t.initiated_by]?.email ?? '',
    new_owner_name:    t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.full_name ?? 'Unknown') : null,
    new_owner_account_email: t.new_owner_user_id ? (profileMap[t.new_owner_user_id]?.email ?? '') : null,
  }))

  return NextResponse.json({ transfers: enriched })
}
