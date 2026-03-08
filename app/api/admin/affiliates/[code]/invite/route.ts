/**
 * POST /api/admin/affiliates/[code]/invite
 * Creates a channel_rep Supabase account and links it to the affiliate code.
 * If the email already exists as a user, it updates their profile instead.
 *
 * Body: { email, display_name, password? }
 * - If password is provided → creates account directly (no email confirmation needed)
 * - If password is omitted  → sends a Supabase invite email
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { code } = await params
  const body = await req.json().catch(() => ({}))
  const { email, display_name, password } = body

  if (!email || !display_name) {
    return NextResponse.json({ error: 'email and display_name required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify affiliate code exists
  const { data: aff } = await service
    .from('affiliate_codes')
    .select('code, owner_name')
    .eq('code', code)
    .single()

  if (!aff) {
    return NextResponse.json({ error: 'Affiliate code not found' }, { status: 404 })
  }

  // Sentinel org for platform accounts
  const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'

  // Check if user already exists
  const { data: existingUsers } = await service.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email.toLowerCase())

  let userId: string

  if (existingUser) {
    // Update their profile to channel_rep + link code
    userId = existingUser.id
    const { error: profileErr } = await service
      .from('profiles')
      .update({
        platform_role: 'channel_rep',
        affiliate_code: code,
      })
      .eq('id', userId)

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }
  } else if (password) {
    // Create with password — no email confirmation required
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message ?? 'Failed to create user' }, { status: 500 })
    }
    userId = created.user.id

    const { error: profileErr } = await service.from('profiles').insert({
      id:             userId,
      display_name,
      role:           'dealer_rep',      // default dealer role (not used in sales portal)
      org_id:         SENTINEL_ORG_ID,   // sentinel org for platform accounts
      platform_role:  'channel_rep',
      affiliate_code: code,
    })

    if (profileErr) {
      await service.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }
  } else {
    // Send invite email
    const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
      data: { display_name, platform_role: 'channel_rep', affiliate_code: code },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'}/sales`,
    })
    if (inviteErr || !invited.user) {
      return NextResponse.json({ error: inviteErr?.message ?? 'Failed to send invite' }, { status: 500 })
    }
    userId = invited.user.id

    // Pre-create their profile so the portal works after they accept
    await service.from('profiles').upsert({
      id:             userId,
      display_name,
      role:           'dealer_rep',
      org_id:         SENTINEL_ORG_ID,
      platform_role:  'channel_rep',
      affiliate_code: code,
    }, { onConflict: 'id' })
  }

  return NextResponse.json({
    ok:           true,
    user_id:      userId,
    email,
    display_name,
    affiliate_code: code,
    invited:      !existingUser && !password,
  }, { status: 201 })
}
