import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'
import { sendNotificationEmail } from '@/lib/email/notify'
import { buildWelcomeEmailHtml } from '@/lib/email/onboarding'
import { normalizePhone } from '@/lib/utils/phone'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// Vector 1: known disposable / throwaway email domains — flag-only (non-blocking)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamailblock.com', 'tempmail.com',
  'temp-mail.org', 'throwaway.email', 'yopmail.com', '10minutemail.com', 'maildrop.cc',
  'sharklasers.com', 'trashmail.com', 'dispostable.com', 'getairmail.com', 'fakeinbox.com',
  'spamgourmet.com', 'spamspot.com', 'discard.email', 'mailnull.com', 'crapmail.org',
  'tempr.email', 'trashmail.io', 'spam4.me', 'throwam.com', 'mintemail.com',
  'safetymail.info', 'fakemail.net', 'mailnesia.com', 'mytrashmail.com', 'sogetthis.com',
  'spamherelots.com', 'trashmail.at', 'trashmail.me', 'trashmail.net',
])

export async function POST(req: NextRequest) {
  const {
    email, password, display_name, invite_code, phone,
    agreed_to_terms, agreed_to_terms_at,
    ref_code,         // affiliate/flyer code from URL param ?ref=CODE
    referred_by_slug, // referral from existing dealer (?via=their-slug)
  } = await req.json()

  if (!email || !password || !display_name) {
    return NextResponse.json({ error: 'email, password, and display_name are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  // Clickwrap consent is required — reject server-side even if client bypassed
  if (!agreed_to_terms) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to create an account.' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── Churn / re-signup detection ────────────────────────────────────────────
  // If this email domain or phone number previously had a canceled org, skip trial.
  // This discourages the "sign up → use product → cancel → re-sign up for free trial" pattern.
  const emailDomain = email.split('@')[1]?.toLowerCase() ?? ''
  const phoneNorm   = phone ? normalizePhone(String(phone)) : null

  let churnRiskFlagged = false
  const disposableDomain = emailDomain ? DISPOSABLE_DOMAINS.has(emailDomain) : false

  if (emailDomain) {
    const { data: priorByDomain } = await service
      .from('organizations')
      .select('id, subscription_status')
      .eq('signup_email_domain', emailDomain)
      .eq('subscription_status', 'canceled')
      .limit(1)
      .maybeSingle()
    if (priorByDomain) churnRiskFlagged = true
  }

  if (!churnRiskFlagged && phoneNorm) {
    const { data: priorByPhone } = await service
      .from('organizations')
      .select('id, subscription_status')
      .eq('signup_phone_normalized', phoneNorm)
      .eq('subscription_status', 'canceled')
      .limit(1)
      .maybeSingle()
    if (priorByPhone) churnRiskFlagged = true
  }
  // ── End churn detection ────────────────────────────────────────────────────

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
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null

    // Validate affiliate code if provided
    let validatedAffiliateCode: string | null = null
    if (ref_code) {
      const code = String(ref_code).toUpperCase().trim()
      const { data: affCode } = await service
        .from('affiliate_codes')
        .select('code')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle()
      validatedAffiliateCode = affCode?.code ?? null
      // If code doesn't exist we still allow signup — just don't attribute it
    }

    // Validate referring org slug if provided (existing dealer referral)
    let referredByOrgId: string | null = null
    if (referred_by_slug) {
      const { data: referrer } = await service
        .from('organizations')
        .select('id')
        .eq('slug', String(referred_by_slug).toLowerCase().trim())
        .eq('subscription_status', 'active')
        .maybeSingle()
      referredByOrgId = referrer?.id ?? null
    }

    const { error: orgErr } = await service.from('organizations').insert({
      id: orgId,
      name: `${display_name}'s Dealership`,
      // Free beta tier: auto-approve immediately (no superadmin review gate)
      approved_at:         new Date().toISOString(),
      subscription_status: 'free',
      signup_email_domain:     emailDomain || null,
      signup_phone_normalized: phoneNorm,
      churn_risk_flagged:      churnRiskFlagged,
      // Clickwrap consent record — legally required for ToS enforceability
      terms_agreed_at: agreed_to_terms_at ?? new Date().toISOString(),
      terms_ip:        clientIp,
      // Affiliate / referral attribution
      affiliate_code:       validatedAffiliateCode,
      referred_by_org_id:   referredByOrgId,
    })
    if (orgErr && !orgErr.message.includes('duplicate') && !orgErr.code?.includes('23505')) {
      await service.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }

    await service.from('org_settings').insert({ org_id: orgId })

    // Welcome email -- fire and forget
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
    void sendNotificationEmail({
      to: email,
      subject: "You're in. Let's get your dealership ready today.",
      html: buildWelcomeEmailHtml(display_name, appUrl),
    })

    // If referred by an existing active dealer, activate their 5% referral discount
    if (referredByOrgId) {
      await service
        .from('organizations')
        .update({ referral_discount_pct: 5 })
        .eq('id', referredByOrgId)
    }

    // Log churn risk flag so SuperAdmin sees it on the approval queue
    if (churnRiskFlagged) {
      await service.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'churn_reregister',
        severity:  'high',
        details: {
          email_domain: emailDomain,
          phone_normalized: phoneNorm,
          note: 'Prior canceled org detected with same email domain or phone. No trial period — billing starts immediately on approval.',
        },
      })
    }

    // Vector 1: disposable email domain flag (non-blocking — admin reviews at approval)
    if (disposableDomain) {
      await service.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'disposable_email',
        severity:  'medium',
        details: {
          email_domain: emailDomain,
          note: 'Signup used a known disposable/throwaway email domain. Review before approving.',
        },
      })
    }

    // ── IP /24 subnet clustering (Vector 2) ──────────────────────────────────
    // > 2 orgs registered from the same /24 subnet in 7 days → high-risk flag.
    const subnet24 = clientIp && /^\d+\.\d+\.\d+\.\d+$/.test(clientIp)
      ? clientIp.split('.').slice(0, 3).join('.')
      : null

    if (subnet24) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: subnetCount } = await service
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .like('terms_ip', `${subnet24}.%`)
        .gte('created_at', sevenDaysAgo)

      if ((subnetCount ?? 0) >= 2) {
        void service.from('abuse_flags').insert({
          org_id:    orgId,
          flag_type: 'ip_clustering',
          severity:  'high',
          details: {
            subnet:    `${subnet24}.0/24`,
            org_count: (subnetCount ?? 0) + 1,
            ip:        clientIp,
            note:      'More than 2 registrations from the same /24 subnet in 7 days.',
          },
        })
      }
    }

    // ── Device fingerprint (Vector 3) ────────────────────────────────────────
    // Server-side fingerprint: SHA-256 of IP + stripped User-Agent.
    // signup_fingerprint column added in migration 044.
    const ua = req.headers.get('user-agent') ?? ''
    const fpRaw = `${clientIp ?? ''}|${ua.toLowerCase().replace(/[\d.]+/g, '').trim()}`
    const fingerprint = crypto.createHash('sha256').update(fpRaw).digest('hex')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: fpCount } = await service
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('signup_fingerprint', fingerprint)
      .gte('created_at', thirtyDaysAgo)

    // Store fingerprint on org row
    void service.from('organizations').update({ signup_fingerprint: fingerprint }).eq('id', orgId)

    if ((fpCount ?? 0) >= 1) {
      void service.from('abuse_flags').insert({
        org_id:    orgId,
        flag_type: 'device_fingerprint_match',
        severity:  'high',
        details: {
          fp_prefix:  fingerprint.slice(0, 16),
          prior_orgs: fpCount,
          note:       'Same device fingerprint (IP+UA) used to register another org in the past 30 days.',
        },
      })
    }
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
    // Free beta tier: auto-approved, go straight to app
    return NextResponse.json({ id: userId, role, success: true, redirect: '/today' })
  }

  return NextResponse.json({ id: userId, role, success: true })
}
