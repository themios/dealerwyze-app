import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canAccessAdminArea, isPlatformSuperAdmin } from '@/lib/auth/platform'

export async function GET() {
  const profile = await requireProfile()
  if (!await canAccessAdminArea(profile.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)

  let query = supabase
    .from('support_tickets')
    .select(`
      id, subject, status, priority, created_at, resolved_at, assigned_to,
      sla_breach_at, first_staff_response_at,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Platform staff only see their assigned tickets
  if (!isSuperAdmin) {
    query = query.eq('assigned_to', profile.id)
  }

  const { data } = await query
  return NextResponse.json(data ?? [])
}
