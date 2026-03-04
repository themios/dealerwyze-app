import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(req: NextRequest) {
  const { email, password, display_name, invite_code } = await req.json()

  if (!email || !password || !display_name) {
    return NextResponse.json({ error: 'email, password, and display_name are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const service = createServiceClient()

  // Resolve org from invite code (if provided)
  let orgId: string | null = null
  let role: 'admin' | 'agent' = 'admin'

  if (invite_code) {
    const code = invite_code.trim().toUpperCase()
    const { data: adminProfile } = await service
      .from('profiles')
      .select('org_id')
      .eq('invite_code', code)
      .single()

    if (!adminProfile) {
      return NextResponse.json({ error: 'Invalid team code' }, { status: 400 })
    }
    orgId = adminProfile.org_id
    role = 'agent'
  }

  // Create auth user
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Failed to create user'
    const status = msg.toLowerCase().includes('already') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  const userId = created.user.id

  // For admins, org_id = their own user id
  if (role === 'admin') {
    orgId = userId

    // Create org + org_settings via service client (bypasses RLS deny policies).
    // approved_at intentionally omitted — new orgs start in pending state.
    // The create_org_on_signup trigger also does this, but explicit creation here
    // is more reliable when RLS deny policies are in place.
    const { error: orgErr } = await service.from('organizations').insert({
      id: orgId,
      name: `${display_name}'s Dealership`,
      // approved_at: omitted → NULL → pending approval
    })
    if (orgErr && !orgErr.message.includes('duplicate') && !orgErr.code?.includes('23505')) {
      await service.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }

    await service.from('org_settings').insert({ org_id: orgId })
  }

  const { error: profileErr } = await service.from('profiles').insert({
    id: userId,
    display_name,
    role,
    org_id: orgId,
    ...(role === 'admin' ? { invite_code: generateInviteCode() } : {}),
  })

  if (profileErr) {
    // Rollback user creation on profile failure
    await service.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  if (role === 'admin') {
    // New dealer orgs start pending — redirect to waiting room
    return NextResponse.json({ id: userId, role, success: true, redirect: '/pending' })
  }

  return NextResponse.json({ id: userId, role, success: true })
}
