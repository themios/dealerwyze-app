import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers, ROLE_LABELS } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { APP_URL } from '@/lib/stripe'
import { sendNotificationEmail } from '@/lib/email/notify'
import { buildTeamInviteEmailHtml } from '@/lib/email/teamInvite'

const ALLOWED_DEALER_ROLES: UserRole[] = [
  'dealer_admin',
  'dealer_manager',
  'dealer_finance',
  'dealer_rep',
  'dealer_staff',
]

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] || ''
  const cleaned = local.replace(/[._]+/g, ' ').trim()
  if (!cleaned) return email
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function requireUserManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || !canManageUsers(profile.role as UserRole)) return null
  return { user, profile }
}

/** GET /api/admin/users — list all active members in org with assigned lead counts */
export async function GET(req: NextRequest) {
  const auth = await requireUserManager()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const includeDeactivated = req.nextUrl.searchParams.get('include_deactivated') === 'true'

  const service = createServiceClient()
  const [{ data: profiles, error }, { data: customerCounts }, { data: orgSettings }] = await Promise.all([
    service
      .from('profiles')
      .select('*')
      .eq('org_id', auth.profile.org_id)
      .order('created_at', { ascending: true })
      .then(res => {
        if (!includeDeactivated) {
          return { ...res, data: res.data?.filter(p => !p.deactivated_at) ?? null }
        }
        return res
      }),
    service
      .from('customers')
      .select('assigned_to')
      .eq('user_id', auth.profile.org_id)
      .not('assigned_to', 'is', null),
    service
      .from('org_settings')
      .select('lead_assignment_mode')
      .eq('org_id', auth.profile.org_id)
      .maybeSingle(),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  customerCounts?.forEach(c => {
    if (c.assigned_to) counts[c.assigned_to] = (counts[c.assigned_to] ?? 0) + 1
  })

  const users = profiles?.map(p => ({
    ...p,
    assigned_count: counts[p.id] ?? 0,
    role_label: ROLE_LABELS[p.role as UserRole] ?? p.role,
  })) ?? []

  return NextResponse.json({ users, lead_assignment_mode: orgSettings?.lead_assignment_mode ?? 'owner' })
}

/** POST /api/admin/users — invite a new user to this org */
export async function POST(req: NextRequest) {
  const auth = await requireUserManager()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    email,
    display_name,
    password,
    role,
  } = body as {
    email?: string
    display_name?: string
    password?: string
    role?: UserRole
  }

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const assignedRole: UserRole =
    role && ALLOWED_DEALER_ROLES.includes(role) ? role : 'dealer_staff'

  const service = createServiceClient()

  // Branch 1: full create with explicit password (used by internal admin tools)
  if (password && display_name) {
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 })
    }

    const { error: profileErr } = await service.from('profiles').insert({
      id: created.user.id,
      display_name,
      role: assignedRole,
      org_id: auth.profile.org_id,
    })

    if (profileErr) {
      await service.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ id: created.user.id, email, display_name, role: assignedRole })
  }

  // Branch 2: invite flow (used by onboarding "Invite Your Team")
  const finalDisplayName = (display_name && display_name.trim()) || displayNameFromEmail(email)

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
    data: {
      display_name: finalDisplayName,
      role: assignedRole,
      org_id: auth.profile.org_id,
    },
    redirectTo: `${APP_URL}/login`,
  })

  if (inviteErr || !invited?.user) {
    const msg = inviteErr?.message?.toLowerCase() || ''
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: inviteErr?.message || 'Failed to send invite' }, { status: 500 })
  }

  const { error: profileErr } = await service.from('profiles').upsert({
    id: invited.user.id,
    display_name: finalDisplayName,
    role: assignedRole,
    org_id: auth.profile.org_id,
  }, { onConflict: 'id' })

  if (profileErr) {
    await service.auth.admin.deleteUser(invited.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // Fire-and-forget: send a rich team invite email that explains the value prop
  void sendNotificationEmail({
    to: email,
    subject: 'Your DealerWyze login is ready',
    html: buildTeamInviteEmailHtml(finalDisplayName, APP_URL),
  })

  return NextResponse.json({ id: invited.user.id, email, display_name: finalDisplayName, role: assignedRole })
}

/** PATCH /api/admin/users — regenerate invite code for the calling admin */
export async function PATCH(_req: NextRequest) {
  const auth = await requireUserManager()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]

  const service = createServiceClient()
  await service.from('profiles').update({ invite_code: code }).eq('id', auth.user.id)

  return NextResponse.json({ invite_code: code })
}

/** DELETE /api/admin/users?id=uuid — soft-deactivate user (preserves history) */
export async function DELETE(req: NextRequest) {
  const auth = await requireUserManager()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === auth.user.id) return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 })

  const service = createServiceClient()

  const { data: target } = await service.from('profiles').select('org_id').eq('id', id).single()
  if (target?.org_id !== auth.profile.org_id) {
    return NextResponse.json({ error: 'Not in your org' }, { status: 403 })
  }

  // Soft-disable: stamp deactivated_at + sign out active sessions
  const { error } = await service
    .from('profiles')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate all active sessions for this user
  await service.auth.admin.signOut(id, 'global').catch(() => {})

  return NextResponse.json({ success: true })
}
