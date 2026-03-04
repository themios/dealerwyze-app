import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

export interface QuotaStatus {
  allowed: boolean
  warning_level: 'ok' | 'soft' | 'hard' | 'over'
  is_mms_blocked: boolean
  current_count: number
  mms_count: number
  quota: number
  reason?: string
}

// Updated plan limits (Pro $99.95 / Voice $199)
const MMS_CAP     = 200   // 200 MMS/mo included
const WARN_SOFT   = 0.80  // 80%  → email + SMS notification, show in-app banner
const WARN_HARD   = 0.95  // 95%  → urgent warning

export async function checkQuota(orgId: string, isMms = false): Promise<QuotaStatus> {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select(`
      monthly_message_count, monthly_mms_count, sms_quota, sms_overage_enabled,
      autofill_enabled, quota_soft_notified_at, billing_cycle_start
    `)
    .eq('id', orgId)
    .single()

  if (!org) {
    return { allowed: true, warning_level: 'ok', is_mms_blocked: false, current_count: 0, mms_count: 0, quota: 1500 }
  }

  const count    = (org as Record<string, unknown>).monthly_message_count as number ?? 0
  const mmsCount = (org as Record<string, unknown>).monthly_mms_count as number ?? 0
  const quota    = (org as Record<string, unknown>).sms_quota as number ?? 0

  // No SMS on this plan
  if (quota === 0) {
    return {
      allowed: false, is_mms_blocked: false, warning_level: 'over',
      current_count: count, mms_count: mmsCount, quota,
      reason: 'SMS is not included in your current plan.',
    }
  }

  // MMS hard cap (200/mo)
  if (isMms && mmsCount >= MMS_CAP) {
    return {
      allowed: false, is_mms_blocked: true, warning_level: 'ok',
      current_count: count, mms_count: mmsCount, quota,
      reason: `MMS cap reached (${MMS_CAP}/mo). Send as SMS-only message.`,
    }
  }

  // Hard quota exceeded + no autofill/overage
  const overageEnabled = (org as Record<string, unknown>).sms_overage_enabled as boolean
  const autofillEnabled = (org as Record<string, unknown>).autofill_enabled as boolean
  if (count >= quota && !overageEnabled && !autofillEnabled) {
    return {
      allowed: false, is_mms_blocked: false, warning_level: 'over',
      current_count: count, mms_count: mmsCount, quota,
      reason: `Monthly quota of ${quota} messages reached. Enable auto-refill in billing settings to continue sending.`,
    }
  }

  const pct = quota > 0 ? count / quota : 0
  const warning_level =
    count >= quota   ? 'over' :
    pct >= WARN_HARD ? 'hard' :
    pct >= WARN_SOFT ? 'soft' : 'ok'

  // Fire 80% notification (once per billing cycle) — fire-and-forget
  if (warning_level === 'soft' || warning_level === 'hard' || warning_level === 'over') {
    const notifiedAt = (org as Record<string, unknown>).quota_soft_notified_at as string | null
    const cycleStart = (org as Record<string, unknown>).billing_cycle_start as string | null
    const alreadyNotified = notifiedAt && cycleStart && notifiedAt >= cycleStart
    if (!alreadyNotified) {
      void triggerQuotaNotification(orgId, count, quota, Math.round(pct * 100))
    }
  }

  return { allowed: true, is_mms_blocked: false, warning_level, current_count: count, mms_count: mmsCount, quota }
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
  const urgency = isOver ? 'LIMIT REACHED' : pct >= 95 ? '95% Used' : '80% Used'

  await sendNotificationEmail({
    to: dealerEmail,
    subject: `DealerWyze SMS: ${urgency} — ${used}/${quota} messages used`,
    html: `
<p>Hi,</p>
<p>Your DealerWyze account has used <strong>${used} of ${quota} messages</strong> (${pct}%) this billing cycle.</p>
${isOver
  ? `<p style="color:#dc2626;font-weight:bold">Outbound SMS is paused until your quota resets or you enable auto-refill.</p>`
  : `<p>You are approaching your monthly limit. Enable <strong>Auto-Refill</strong> in billing settings to avoid interruption.</p>`
}
<p>
  <a href="${appUrl}/settings/billing" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
    Manage SMS &amp; Billing
  </a>
</p>
<p>Auto-refill adds $20 of additional messages when you hit your limit, keeping your team running without interruption. You control it — it never charges without your approval.</p>
<p style="color:#888;font-size:12px">DealerWyze — Intelligent Operating System for Independent Dealers</p>
`,
  })

  // Also log an admin alert so the platform team can monitor high-usage dealers
  await supabase.from('admin_alerts').insert({
    org_id:     orgId,
    alert_type: isOver ? 'quota_exceeded' : 'quota_80pct',
    severity:   isOver ? 'warning' : 'info',
  }).maybeSingle()
}

export async function incrementUsage(orgId: string, isMms = false): Promise<void> {
  const supabase = createServiceClient()
  await supabase.rpc('increment_sms_usage', { p_org_id: orgId, p_is_mms: isMms })
}
