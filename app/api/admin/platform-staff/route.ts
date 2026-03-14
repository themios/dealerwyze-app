import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'
import { sendNotificationEmail } from '@/lib/email/notify'

/** GET /api/admin/platform-staff — list all platform staff */
export async function GET() {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('platform_role', 'platform_staff')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * POST /api/admin/platform-staff
 * Body: { email, display_name }
 * Invites a platform staff user — Supabase sends an email with a login link.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { email, display_name } = await req.json() as {
    email?: string
    display_name?: string
  }
  if (!email || !display_name) {
    return NextResponse.json({ error: 'email and display_name are required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const service = createServiceClient()

  // Invite user — Supabase emails them a magic link to set their password
  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })

  if (inviteErr || !invited?.user) {
    console.error('[platform-staff POST] inviteUserByEmail failed:', inviteErr?.message)
    const msg = inviteErr?.message ?? ''
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to send invite.' }, { status: 500 })
  }

  // Ensure sentinel org exists (no-op if already present)
  const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000001'
  await service.from('organizations').upsert(
    { id: SENTINEL_ORG_ID, name: 'Platform Staff Sentinel', plan: 'platform', subscription_status: 'active' },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  // Upsert profile (user may have been invited before)
  const { error: profileErr } = await service.from('profiles').upsert({
    id: invited.user.id,
    display_name,
    role: 'agent',
    org_id: SENTINEL_ORG_ID,
    platform_role: 'platform_staff',
  }, { onConflict: 'id' })

  if (profileErr) {
    console.error('[platform-staff POST] profile upsert failed:', profileErr.message)
    await service.auth.admin.deleteUser(invited.user.id)
    return NextResponse.json({ error: 'Failed to create staff profile.' }, { status: 500 })
  }

  await logAdminAction(profile.id, 'create_platform_staff', null, { email, display_name })

  // Send welcome email with platform overview and commission structure
  await sendNotificationEmail({
    to: email,
    subject: 'Welcome to the DealerWyze team — your commission engine is ready',
    html: buildWelcomeEmail(display_name),
  })

  return NextResponse.json({ id: invited.user.id, email, display_name })
}


/**
 * PATCH /api/admin/platform-staff
 * Body: { id, display_name }
 * Updates display_name for a platform staff member.
 */
export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const { id, display_name } = body as { id?: string; display_name?: string }

  if (!id || !display_name?.trim()) {
    return NextResponse.json({ error: 'id and display_name required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify target is platform_staff
  const { data: existing } = await service
    .from('profiles')
    .select('id, platform_role')
    .eq('id', id)
    .eq('platform_role', 'platform_staff')
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const { error } = await service
    .from('profiles')
    .update({ display_name: display_name.trim() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  await logAdminAction(profile.id, 'update_platform_staff', null, { user_id: id, display_name })
  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/admin/platform-staff?id=uuid
 * Removes platform_role from the user (demotes to normal user or deletes).
 */
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ platform_role: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(profile.id, 'remove_platform_staff', null, { user_id: id })
  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome email template — sent to every new platform staff member on invite
// ─────────────────────────────────────────────────────────────────────────────
function buildWelcomeEmail(displayName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0D2B55 0%,#1a4480 100%);padding:40px 40px 32px;text-align:center">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:3px;color:#93c5fd;text-transform:uppercase">DealerWyze Partner Team</p>
      <h1 style="margin:0;font-size:32px;font-weight:800;color:#ffffff;line-height:1.2">You're in, ${displayName}.</h1>
      <p style="margin:16px 0 0;font-size:16px;color:#bfdbfe;line-height:1.5">Your account is set up. Your commission clock just started.</p>
    </td>
  </tr>

  <!-- Reptilian hook: direct income path -->
  <tr>
    <td style="padding:40px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:24px">
        <tr>
          <td>
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;color:#16a34a;text-transform:uppercase">Your earning potential</p>
            <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#14532d;line-height:1.2">Close 10 dealers. Earn $1,000+ every single month — without lifting a finger after the sale.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 16px;background:#dcfce7;border-radius:8px;text-align:center;width:30%">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#15803d">10%</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#166534;font-weight:600">First payment</p>
                </td>
                <td style="width:5%"></td>
                <td style="padding:10px 16px;background:#dcfce7;border-radius:8px;text-align:center;width:30%">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#15803d">2%</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#166534;font-weight:600">Every month after</p>
                </td>
                <td style="width:5%"></td>
                <td style="padding:10px 16px;background:#dcfce7;border-radius:8px;text-align:center;width:30%">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#15803d">♾</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#166534;font-weight:600">Lifetime recurring</p>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:13px;color:#166534"><strong>Example:</strong> Bring in a dealer at $199/mo → $19.90 upfront + $3.98 every month they stay. 25 dealers = ~$100/mo in passive recurring income. 100 dealers = $400+/mo while you sleep.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Limbic: belonging and identity -->
  <tr>
    <td style="padding:32px 40px 0">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;color:#6b7280;text-transform:uppercase">What you've joined</p>
      <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827">DealerWyze is transforming how independent dealers run their business.</h2>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7">Most independent used-car dealers are drowning in sticky notes, spreadsheets, and missed follow-ups. DealerWyze gives them a modern CRM built specifically for their world — texting, voice AI, financing, bookkeeping, and Google reviews in one place. You're not selling software. You're handing a struggling small business owner a lifeline.</p>
    </td>
  </tr>

  <!-- Neocortex: the math, the plan, the logic -->
  <tr>
    <td style="padding:32px 40px 0">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;color:#6b7280;text-transform:uppercase">The numbers make sense</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <tr style="background:#f9fafb">
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb">DEALERS REFERRED</td>
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb">FIRST-MONTH BONUS</td>
          <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb">MONTHLY RECURRING</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">5 dealers</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">~$100</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#15803d;border-bottom:1px solid #e5e7eb">~$20/mo</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">25 dealers</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">~$500</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#15803d;border-bottom:1px solid #e5e7eb">~$100/mo</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">100 dealers</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">~$2,000</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#15803d;border-bottom:1px solid #e5e7eb">~$400/mo</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#111827">500 dealers</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827">~$10,000</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:800;color:#15803d">~$2,000/mo</td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;color:#9ca3af">Based on $199/mo plan. Recurring commission paid monthly as long as dealers remain active.</p>
    </td>
  </tr>

  <!-- What's in the platform -->
  <tr>
    <td style="padding:32px 40px 0">
      <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:2px;color:#6b7280;text-transform:uppercase">What dealers get (and love)</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 8px 12px 0;vertical-align:top;width:50%">
            <div style="padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #3b82f6">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e40af">📱 AI-Powered CRM</p>
              <p style="margin:0;font-size:12px;color:#374151">Leads, texting, voice AI, follow-ups — all in one app built for the lot.</p>
            </div>
          </td>
          <td style="padding:0 0 12px 8px;vertical-align:top;width:50%">
            <div style="padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #8b5cf6">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#6d28d9">💬 Two-Way Texting</p>
              <p style="margin:0;font-size:12px;color:#374151">Reply to leads by text from their phone. 10x higher open rates than email.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 8px 12px 0;vertical-align:top">
            <div style="padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #f59e0b">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e">🤖 Voice AI Agent</p>
              <p style="margin:0;font-size:12px;color:#374151">Answers calls 24/7, qualifies buyers, and logs summaries automatically.</p>
            </div>
          </td>
          <td style="padding:0 0 12px 8px;vertical-align:top">
            <div style="padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #10b981">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065f46">📊 BHPH & Finance</p>
              <p style="margin:0;font-size:12px;color:#374151">Buy-here-pay-here tracking, payment reminders, and deal ledgers built in.</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:32px 40px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D2B55;border-radius:10px;padding:28px">
        <tr>
          <td style="text-align:center">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff">Your login link is in a separate email from Supabase.</p>
            <p style="margin:0 0 20px;font-size:14px;color:#93c5fd">Check your inbox for an email with the subject "Confirm your signup" — click it to set your password and access your admin dashboard.</p>
            <p style="margin:0;font-size:13px;color:#bfdbfe">Questions? Reply to this email or reach out to <a href="mailto:support@dealerwyze.com" style="color:#60a5fa">support@dealerwyze.com</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:0 40px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">DealerWyze · dealerwyze.com · Built for independent dealers, by dealers.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
  `
}
