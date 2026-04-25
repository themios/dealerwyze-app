import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { fireCogsAlertBackground } from '@/lib/cogs/alertWebhook'

export interface QuotaStatus {
  allowed: boolean
  warning_level: 'ok' | 'soft' | 'hard' | 'over'
  is_mms_blocked: boolean
  current_count: number
  mms_count: number
  quota: number
  /** True if this message is an overage (above quota but allowed via opt-in) */
  is_overage: boolean
  reason?: string
}

const MMS_CAP   = 200   // 200 MMS/mo included on paid SMS plans
const WARN_SOFT = 0.80  // 80% → email warning, in-app banner
const WARN_HARD = 0.95  // 95% → urgent warning

export async function checkQuota(orgId: string, isMms = false): Promise<QuotaStatus> {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select(`
      monthly_message_count, monthly_mms_count, sms_quota,
      sms_overage_enabled, sms_overage_enabled_v2,
      autofill_enabled, quota_soft_notified_at, billing_cycle_start,
      sms_overage_count, mms_overage_count, created_at,
      overage_buffer_cents
    `)
    .eq('id', orgId)
    .single()

  if (!org) {
    console.error('[sms-quota] failed to fetch org quota, blocking send:', orgId)
    return { allowed: false, warning_level: 'over', is_mms_blocked: false, is_overage: false, current_count: 0, mms_count: 0, quota: 0, reason: 'quota_check_failed' }
  }

  const count    = (org as Record<string, unknown>).monthly_message_count as number ?? 0
  const mmsCount = (org as Record<string, unknown>).monthly_mms_count as number ?? 0
  const quota    = (org as Record<string, unknown>).sms_quota as number ?? 0

  // Progressive trust: new orgs (< 14 days old) get 50% of their SMS quota
  const createdAt = (org as Record<string, unknown>).created_at as string | null
  const orgAgeDays = createdAt
    ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000
    : 999
  const effectiveQuota = orgAgeDays < 14 ? Math.floor(quota * 0.5) : quota

  // No SMS on this plan (Voice AI or Free)
  if (quota === 0) {
    return {
      allowed: false, is_mms_blocked: false, warning_level: 'over', is_overage: false,
      current_count: count, mms_count: mmsCount, quota,
      reason: 'Texting is not included in your current plan. Upgrade to Complete CRM to send messages to customers.',
    }
  }

  // MMS hard cap — overage opt-in applies to MMS too
  const overageEnabled = !!(
    (org as Record<string, unknown>).sms_overage_enabled_v2 as boolean ||
    (org as Record<string, unknown>).sms_overage_enabled as boolean  // legacy flag
  )
  const autofillEnabled   = (org as Record<string, unknown>).autofill_enabled as boolean
  const bufferCents       = (org as Record<string, unknown>).overage_buffer_cents as number ?? 0
  const hasBuffer         = bufferCents > 0
  // SMS = 8¢/msg, MMS = 15¢/msg (MMS costs more to deliver)
  const SMS_OVERAGE_CENTS = 8
  const MMS_OVERAGE_CENTS = 15

  if (isMms && mmsCount >= MMS_CAP) {
    if (!hasBuffer && !overageEnabled && !autofillEnabled) {
      return {
        allowed: false, is_mms_blocked: true, warning_level: 'ok', is_overage: false,
        current_count: count, mms_count: mmsCount, quota: effectiveQuota,
        reason: `You've reached your monthly picture message limit (${MMS_CAP} included). Go to Settings → Billing to add prepaid credit and keep sending.`,
      }
    }
    if (hasBuffer) {
      const newBalance = await deductBuffer(orgId, MMS_OVERAGE_CENTS)
      if (newBalance < 0) {
        return {
          allowed: false, is_mms_blocked: true, warning_level: 'over', is_overage: false,
          current_count: count, mms_count: mmsCount, quota: effectiveQuota,
          reason: 'Your prepaid credit has run out. Go to Settings → Billing to add more — messages will send immediately after.',
        }
      }
      if (newBalance <= 500) void triggerLowBufferNotification(orgId, newBalance)
    }
    void incrementMmsOverage(orgId)
    return { allowed: true, is_mms_blocked: false, warning_level: 'over', is_overage: true, current_count: count, mms_count: mmsCount, quota: effectiveQuota }
  }

  // SMS quota exceeded
  if (count >= effectiveQuota) {
    if (!hasBuffer && !overageEnabled && !autofillEnabled) {
      return {
        allowed: false, is_mms_blocked: false, warning_level: 'over', is_overage: false,
        current_count: count, mms_count: mmsCount, quota: effectiveQuota,
        reason: `You've used all ${effectiveQuota} messages included in your plan this month. Go to Settings → Billing to add prepaid credit and keep texting.`,
      }
    }
    if (hasBuffer) {
      const newBalance = await deductBuffer(orgId, SMS_OVERAGE_CENTS)
      if (newBalance < 0) {
        return {
          allowed: false, is_mms_blocked: false, warning_level: 'over', is_overage: false,
          current_count: count, mms_count: mmsCount, quota: effectiveQuota,
          reason: 'Your prepaid credit has run out. Go to Settings → Billing to add more — messages will send immediately after.',
        }
      }
      if (newBalance <= 500) void triggerLowBufferNotification(orgId, newBalance)
    }
    void incrementSmsOverage(orgId)
    return { allowed: true, is_mms_blocked: false, warning_level: 'over', is_overage: true, current_count: count, mms_count: mmsCount, quota: effectiveQuota }
  }

  const pct = effectiveQuota > 0 ? count / effectiveQuota : 0
  const warning_level =
    count >= effectiveQuota ? 'over' :
    pct >= WARN_HARD        ? 'hard' :
    pct >= WARN_SOFT        ? 'soft' : 'ok'

  // Fire 80% notification (once per billing cycle) — fire-and-forget
  if (warning_level === 'soft' || warning_level === 'hard') {
    const notifiedAt = (org as Record<string, unknown>).quota_soft_notified_at as string | null
    const cycleStart = (org as Record<string, unknown>).billing_cycle_start as string | null
    const alreadyNotified = notifiedAt && cycleStart && notifiedAt >= cycleStart
    if (!alreadyNotified) {
      void triggerQuotaNotification(orgId, count, effectiveQuota, Math.round(pct * 100))
    }
  }

  return { allowed: true, is_mms_blocked: false, warning_level, is_overage: false, current_count: count, mms_count: mmsCount, quota: effectiveQuota }
}

async function incrementSmsOverage(orgId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.rpc('increment_sms_overage', { p_org_id: orgId })
}

async function incrementMmsOverage(orgId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.rpc('increment_mms_overage', { p_org_id: orgId })
}

/** Atomically deduct cost from overage buffer. Returns new balance, or -1 if insufficient. */
async function deductBuffer(orgId: string, costCents: number): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase.rpc('deduct_overage_buffer', { p_org_id: orgId, p_cost_cents: costCents })
  return typeof data === 'number' ? data : -1
}

/** Send a low-buffer reminder email (deduplicated via admin_alerts — once per week). */
async function triggerLowBufferNotification(orgId: string, balanceCents: number): Promise<void> {
  const supabase = createServiceClient()

  // Dedup: skip if we already sent a low-buffer alert in the last 7 days
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: existing } = await supabase
    .from('admin_alerts')
    .select('id')
    .eq('org_id', orgId)
    .eq('alert_type', 'overage_buffer_low')
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (existing) return

  await supabase.from('admin_alerts').insert({
    org_id:     orgId,
    alert_type: 'overage_buffer_low',
    severity:   'warning',
    details:    { balance_cents: balanceCents },
  }).maybeSingle()

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'dealer_admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!adminProfile?.id) return

  const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
  const dealerEmail = authUser?.user?.email
  if (!dealerEmail) return

  const balanceDollars = (balanceCents / 100).toFixed(2)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

  await sendNotificationEmail({
    to: dealerEmail,
    subject: `Action needed: Your DealerWyze messaging credit is almost gone ($${balanceDollars} left)`,
    html: `
<p>Hi,</p>
<p>Your DealerWyze messaging credit is running low — only <strong>$${balanceDollars} remaining</strong>.</p>
<p>Once it runs out, outbound texts and picture messages will pause until you add more credit. Your team won't be able to text customers until you top up.</p>
<p>
  <a href="${appUrl}/settings/billing" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
    Add Credit Now
  </a>
</p>
<p>You can add $10, $25, $50, or $100 — it stays on your account until used and never expires.</p>
<p style="color:#888;font-size:12px">DealerWyze — Dealer Management Platform</p>
`,
  })
}

/** Fire notification email + stamp quota_soft_notified_at. Non-fatal. */
async function triggerQuotaNotification(
  orgId: string,
  used: number,
  quota: number,
  pct: number,
): Promise<void> {
  const supabase = createServiceClient()

  // Stamp first to prevent duplicate sends on concurrent requests
  await supabase
    .from('organizations')
    .update({ quota_soft_notified_at: new Date().toISOString() })
    .eq('id', orgId)

  // Get dealer admin email
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'dealer_admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!adminProfile?.id) return

  const { data: authUser } = await supabase.auth.admin.getUserById(adminProfile.id)
  const dealerEmail = authUser?.user?.email
  if (!dealerEmail) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
  const isOver = pct >= 100

  await sendNotificationEmail({
    to: dealerEmail,
    subject: isOver
      ? `Your DealerWyze texting has paused — monthly limit reached`
      : `Heads up: You've used ${pct}% of your monthly texts on DealerWyze`,
    html: `
<p>Hi,</p>
<p>Your DealerWyze account has used <strong>${used} of ${quota} messages</strong> this billing cycle.</p>
${isOver
  ? `<p style="color:#dc2626;font-weight:bold">Outbound texting has paused for the rest of this billing cycle. Add messaging credit in your billing settings to keep going right now.</p>`
  : `<p>You're getting close to your monthly limit. If you run out, texting stops until the cycle resets — unless you have messaging credit on file.</p>`
}
<p>
  <a href="${appUrl}/settings/billing" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
    ${isOver ? 'Add Messaging Credit' : 'View Billing & Add Credit'}
  </a>
</p>
<p>Messaging credit is a one-time charge ($10, $25, $50, or $100) that keeps your team texting customers when you go over your plan. It stays on your account until used.</p>
<p style="color:#888;font-size:12px">DealerWyze — Dealer Management Platform</p>
`,
  })

  // Also log an admin alert so the platform team can monitor high-usage dealers
  const alertType = isOver ? 'quota_exceeded' : 'quota_80pct'
  const severity  = isOver ? 'warning' : 'info'
  await supabase.from('admin_alerts').insert({
    org_id:     orgId,
    alert_type: alertType,
    severity,
  }).maybeSingle()
  fireCogsAlertBackground({ org_id: orgId, alert_type: alertType, severity, created_at: new Date().toISOString() })
}

export async function incrementUsage(orgId: string, isMms = false): Promise<void> {
  const supabase = createServiceClient()
  await supabase.rpc('increment_sms_usage', { p_org_id: orgId, p_is_mms: isMms })
}
