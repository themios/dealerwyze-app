import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/staff
 * Returns enriched platform staff list. Platform staff are global — they serve all verticals.
 * Superadmin only.
 */
export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'staff')
  if (denied) return denied

  const service = createServiceClient()

  const { data: staffProfiles, error: staffErr } = await service
    .from('profiles')
    .select('id, display_name, created_at, platform_role')
    .eq('platform_role', 'platform_staff')
    .order('created_at', { ascending: true })

  if (staffErr) return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  if (!staffProfiles || staffProfiles.length === 0) return NextResponse.json([])

  const staffIds = staffProfiles.map(s => s.id)

  // Auth user data (email + last sign-in)
  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map(
    (authUsers ?? []).filter(u => staffIds.includes(u.id)).map(u => [u.id, u])
  )

  // Tickets assigned to each staff member
  const { data: ticketRows } = await service
    .from('support_tickets')
    .select('assigned_to, status')
    .in('assigned_to', staffIds)

  const ticketsClosedMap = new Map<string, number>()
  const ticketsOpenMap   = new Map<string, number>()
  for (const t of ticketRows ?? []) {
    if (!t.assigned_to) continue
    if (t.status === 'closed' || t.status === 'resolved') {
      ticketsClosedMap.set(t.assigned_to, (ticketsClosedMap.get(t.assigned_to) ?? 0) + 1)
    } else {
      ticketsOpenMap.set(t.assigned_to, (ticketsOpenMap.get(t.assigned_to) ?? 0) + 1)
    }
  }

  // Orgs assigned to each staff member (graceful if migration 060 not yet applied)
  const orgsAssignedMap = new Map<string, number>()
  try {
    const { data: assignedOrgs } = await service
      .from('organizations')
      .select('assigned_staff_id')
      .in('assigned_staff_id', staffIds)
    for (const o of assignedOrgs ?? []) {
      if (o.assigned_staff_id)
        orgsAssignedMap.set(o.assigned_staff_id, (orgsAssignedMap.get(o.assigned_staff_id) ?? 0) + 1)
    }
  } catch { /* migration 060 pending */ }

  const result = staffProfiles.map(s => {
    const auth = authMap.get(s.id)
    return {
      id:              s.id,
      display_name:    s.display_name,
      email:           auth?.email ?? null,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      created_at:      s.created_at,
      platform_role:   s.platform_role,
      tickets_open:    ticketsOpenMap.get(s.id) ?? 0,
      tickets_closed:  ticketsClosedMap.get(s.id) ?? 0,
      orgs_assigned:   orgsAssignedMap.get(s.id) ?? 0,
    }
  })

  return NextResponse.json(result)
}
