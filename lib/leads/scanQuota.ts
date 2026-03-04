import type { PlanTier } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

// ── Quota limits per plan tier ────────────────────────────────────────────────

interface ScanLimits {
  monthly_images: number
  monthly_pdfs:   number
  daily_images:   number
  daily_pdfs:     number
}

export const SCAN_QUOTA: Record<PlanTier, ScanLimits> = {
  tier1: { monthly_images: 100, monthly_pdfs:  25, daily_images: 20, daily_pdfs: 10 },
  tier2: { monthly_images: 200, monthly_pdfs:  50, daily_images: 20, daily_pdfs: 10 },
  tier3: { monthly_images: 500, monthly_pdfs: 150, daily_images: 20, daily_pdfs: 10 },
}

export interface QuotaCheckResult {
  allowed: boolean
  reason?: 'monthly_image' | 'monthly_pdf' | 'daily_image' | 'daily_pdf'
  monthly_used: number
  monthly_limit: number
  plan: PlanTier
}

// ── Check quota before running AI ────────────────────────────────────────────

export async function checkScanQuota(
  orgId: string,
  isPdf: boolean,
): Promise<QuotaCheckResult> {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('plan, monthly_scan_image_count, monthly_scan_pdf_count')
    .eq('id', orgId)
    .single()

  const plan: PlanTier = (org?.plan as PlanTier) ?? 'tier1'
  const limits = SCAN_QUOTA[plan] ?? SCAN_QUOTA.tier1
  const monthlyUsed = isPdf
    ? (org?.monthly_scan_pdf_count ?? 0)
    : (org?.monthly_scan_image_count ?? 0)
  const monthlyLimit = isPdf ? limits.monthly_pdfs : limits.monthly_images

  if (monthlyUsed >= monthlyLimit) {
    return {
      allowed: false,
      reason: isPdf ? 'monthly_pdf' : 'monthly_image',
      monthly_used: monthlyUsed,
      monthly_limit: monthlyLimit,
      plan,
    }
  }

  // Daily burst check — count today's scan_log entries
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('ai_scan_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('scan_type', isPdf ? 'pdf' : 'image')
    .gte('created_at', todayStart.toISOString())

  const dailyUsed = count ?? 0
  const dailyLimit = isPdf ? limits.daily_pdfs : limits.daily_images

  if (dailyUsed >= dailyLimit) {
    return {
      allowed: false,
      reason: isPdf ? 'daily_pdf' : 'daily_image',
      monthly_used: monthlyUsed,
      monthly_limit: monthlyLimit,
      plan,
    }
  }

  return { allowed: true, monthly_used: monthlyUsed, monthly_limit: monthlyLimit, plan }
}

// ── Increment counters (called async after save via after()) ──────────────────

export async function incrementScanCount(
  orgId: string,
  isPdf: boolean,
  customerId: string | null,
  overallConf: string,
): Promise<void> {
  const supabase = createServiceClient()

  await supabase.rpc('increment_org_scan_counter', {
    p_org_id: orgId,
    p_is_pdf: isPdf,
  })

  await supabase.from('ai_scan_log').insert({
    org_id:       orgId,
    scan_type:    isPdf ? 'pdf' : 'image',
    customer_id:  customerId,
    overall_conf: overallConf,
  })
}
