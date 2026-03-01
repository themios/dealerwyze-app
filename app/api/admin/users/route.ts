import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return { user, profile }
}

/** GET /api/admin/users — list all members in org with assigned lead counts */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const [{ data: profiles, error }, { data: customerCounts }] = await Promise.all([
    service
      .from('profiles')
      .select('*')
      .eq('org_id', auth.profile.org_id)
      .order('created_at', { ascending: true }),
    service
      .from('customers')
      .select('assigned_to')
      .eq('user_id', auth.profile.org_id)
      .not('assigned_to', 'is', null),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count assigned leads per user
  const counts: Record<string, number> = {}
  customerCounts?.forEach(c => {
    if (c.assigned_to) counts[c.assigned_to] = (counts[c.assigned_to] ?? 0) + 1
  })

  const users = profiles?.map(p => ({ ...p, assigned_count: counts[p.id] ?? 0 })) ?? []
  return NextResponse.json({ users })
}

/** POST /api/admin/users — invite a new user */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, display_name, password, role } = await req.json()
  if (!email || !display_name || !password) {
    return NextResponse.json({ error: 'email, display_name, and password are required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Create auth user
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 })
  }

  // Create profile
  const { error: profileErr } = await service.from('profiles').insert({
    id: created.user.id,
    display_name,
    role: role === 'admin' ? 'admin' : 'agent',
    org_id: auth.profile.org_id,
  })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  return NextResponse.json({ id: created.user.id, email, display_name, role })
}

/** PATCH /api/admin/users — generate/regenerate invite code for the calling admin */
export async function PATCH(_req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]

  const service = createServiceClient()
  await service.from('profiles').update({ invite_code: code }).eq('id', auth.user.id)

  return NextResponse.json({ invite_code: code })
}

/** DELETE /api/admin/users?id=uuid — deactivate user */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === auth.user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })

  const service = createServiceClient()

  // Verify user is in org
  const { data: target } = await service.from('profiles').select('org_id').eq('id', id).single()
  if (target?.org_id !== auth.profile.org_id) {
    return NextResponse.json({ error: 'Not in your org' }, { status: 403 })
  }

  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
