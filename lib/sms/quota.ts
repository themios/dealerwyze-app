import { createServiceClient } from '@/lib/supabase/service'

export interface QuotaStatus {
  allowed: boolean
  warning_level: 'ok' | 'soft' | 'hard' | 'over'
  is_mms_blocked: boolean
  current_count: number
  mms_count: number
  quota: number
  reason?: string
}

const MMS_CAP = 50
const WARN_SOFT = 0.80
const WARN_HARD = 0.95

export async function checkQuota(orgId: string, isMms = false): Promise<QuotaStatus> {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('monthly_message_count, monthly_mms_count, sms_quota, sms_overage_enabled')
    .eq('id', orgId)
    .single()

  if (!org) {
    return { allowed: true, warning_level: 'ok', is_mms_blocked: false, current_count: 0, mms_count: 0, quota: 1000 }
  }

  const count    = org.monthly_message_count ?? 0
  const mmsCount = org.monthly_mms_count ?? 0
  const quota    = org.sms_quota ?? 0

  // Tier 1 has quota=0 — SMS not included in plan
  if (quota === 0) {
    return {
      allowed: false, is_mms_blocked: false, warning_level: 'over',
      current_count: count, mms_count: mmsCount, quota,
      reason: 'SMS is not included in your current plan. Upgrade to CRM + SMS to send messages.',
    }
  }

  // MMS hard cap (50/mo regardless of total quota)
  if (isMms && mmsCount >= MMS_CAP) {
    return {
      allowed: false, is_mms_blocked: true, warning_level: 'ok',
      current_count: count, mms_count: mmsCount, quota,
      reason: `MMS cap reached (${MMS_CAP}/mo). Send as SMS or upgrade plan.`,
    }
  }

  // Hard quota exceeded + overage disabled
  if (count >= quota && !org.sms_overage_enabled) {
    return {
      allowed: false, is_mms_blocked: false, warning_level: 'over',
      current_count: count, mms_count: mmsCount, quota,
      reason: `Monthly quota of ${quota} messages exceeded. Enable overage billing or upgrade plan.`,
    }
  }

  const pct = quota > 0 ? count / quota : 0
  const warning_level =
    count >= quota   ? 'over' :
    pct >= WARN_HARD ? 'hard' :
    pct >= WARN_SOFT ? 'soft' : 'ok'

  return { allowed: true, is_mms_blocked: false, warning_level, current_count: count, mms_count: mmsCount, quota }
}

export async function incrementUsage(orgId: string, isMms = false): Promise<void> {
  const supabase = createServiceClient()
  await supabase.rpc('increment_sms_usage', { p_org_id: orgId, p_is_mms: isMms })
}
