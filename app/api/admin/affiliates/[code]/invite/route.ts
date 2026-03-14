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
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

function buildWelcomeEmail(params: {
  display_name: string
  email: string
  code: string
  commission_first_pct: number
  commission_recurring_pct: number
  type: string
  passwordProvided: boolean
}): { subject: string; html: string } {
  const { display_name, email, code, commission_first_pct, commission_recurring_pct, type, passwordProvided } = params
  const portalUrl   = `${APP_URL}/sales`
  const signupUrl   = `${APP_URL}/signup?ref=${code}`
  const recurringRow = type === 'advisor' && commission_recurring_pct > 0
    ? `<li><strong>${commission_recurring_pct}%</strong> of their monthly subscription every month they stay active</li>`
    : ''
  const loginHint = passwordProvided
    ? `<p>Log in at <a href="${portalUrl}">${portalUrl}</a> using <strong>${email}</strong> and the password you were given.</p>`
    : `<p>Check your inbox for a separate setup email to create your password, then log in at <a href="${portalUrl}">${portalUrl}</a>.</p>`

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
  <div style="background:#0D2B55;padding:24px 32px;border-radius:12px 12px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Welcome to DealerWyze, ${display_name}!</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;background:#fff">
    <p>Your sales rep account is ready. Here's everything you need to get started.</p>

    <h2 style="font-size:16px;margin-top:24px">Your Sales Portal</h2>
    ${loginHint}
    <p>From the portal you can:</p>
    <ul>
      <li>See all the dealerships you've signed up</li>
      <li>Track your commissions and payout status</li>
      <li>Archive leads you're no longer working with</li>
    </ul>

    <h2 style="font-size:16px;margin-top:24px">Your Commission Schedule</h2>
    <ul>
      <li><strong>${commission_first_pct}%</strong> of the first month's subscription when a dealer you referred subscribes</li>
      ${recurringRow}
    </ul>
    <p style="font-size:13px;color:#6b7280">Minimum payout is $25. We'll reach out when your balance is ready.</p>

    <h2 style="font-size:16px;margin-top:24px">Your Referral Link</h2>
    <p>Share this link with car dealers — you'll automatically get credit when they sign up:</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:14px;word-break:break-all">
      ${signupUrl}
    </div>
    <p style="font-size:13px;color:#6b7280;margin-top:8px">
      DealerWyze plans start at $150/month (CRM) and $350/month (CRM + Voice AI).
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="font-size:13px;color:#6b7280">
      Questions? Email us at <a href="mailto:support@dealerwyze.com" style="color:#0D2B55">support@dealerwyze.com</a>
    </p>
  </div>
</div>`

  return { subject: `Welcome to DealerWyze — your sales portal is ready`, html }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'affiliates')
  if (denied) return denied

  const { code } = await params
  const body = await req.json().catch(() => ({}))
  const { email, display_name, password } = body

  if (!email || !display_name) {
    return NextResponse.json({ error: 'email and display_name required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify affiliate code exists (fetch commission rates too for welcome email)
  const { data: aff } = await service
    .from('affiliate_codes')
    .select('code, owner_name, commission_first_pct, commission_recurring_pct, type')
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
      redirectTo: `${APP_URL}/sales`,
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

  // Send welcome email (non-fatal) — skip for invite flow since Supabase sends its own email
  if (password || existingUser) {
    const { subject, html } = buildWelcomeEmail({
      display_name,
      email,
      code,
      commission_first_pct:     aff.commission_first_pct,
      commission_recurring_pct: aff.commission_recurring_pct,
      type:                     aff.type,
      passwordProvided:         !!password,
    })
    await sendNotificationEmail({ to: email, subject, html })
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
