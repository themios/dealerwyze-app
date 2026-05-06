import type { SupabaseClient } from '@supabase/supabase-js'

// Monthly render limits per plan
const QUOTA: Record<string, number> = {
  free:    0,   // Free/Beta: no video renders
  growth:  25,  // $150/month plan
  pro:     75,  // $350/month plan
  starter: 0,
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuotaError'
  }
}

export interface QuotaResult {
  allowed: boolean
  used: number
  limit: number
  plan: string
}

/**
 * Check render quota for an org. Throws QuotaError if over limit.
 * Also resets quota if a new month has started.
 */
export async function checkRenderQuota(supabase: SupabaseClient, orgId: string): Promise<QuotaResult> {
  // Get org plan from organizations table
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single()

  const plan = (org?.plan ?? 'free').toLowerCase()
  const limit = QUOTA[plan] ?? 0

  // Get or create org_video_settings
  const { data: settings } = await supabase
    .from('org_video_settings')
    .select('render_quota_used, render_quota_reset_at, render_credits_purchased')
    .eq('org_id', orgId)
    .maybeSingle()

  // Check if quota needs resetting (new month)
  const now = new Date()
  const resetAt = settings?.render_quota_reset_at ? new Date(settings.render_quota_reset_at) : null
  const shouldReset = !resetAt ||
    (now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth())

  let used = settings?.render_quota_used ?? 0
  // Effective limit = plan quota + any purchased credits this month
  const purchased = settings?.render_credits_purchased ?? 0
  const effectiveLimit = limit + purchased

  if (shouldReset) {
    used = 0
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    await supabase.from('org_video_settings').upsert({
      org_id: orgId,
      render_quota_used: 0,
      render_quota_reset_at: monthStart.toISOString(),
      render_credits_purchased: 0, // credits reset monthly
    }, { onConflict: 'org_id' })
  }

  if (effectiveLimit > 0 && used >= effectiveLimit) {
    throw new QuotaError(
      `You have used all ${effectiveLimit} video renders included this month. ` +
      `Add more in Settings > Video (25 extra renders for $10).`
    )
  }

  return { allowed: true, used, limit: effectiveLimit, plan }
}

/**
 * Increment render quota used for an org.
 */
export async function incrementRenderQuota(supabase: SupabaseClient, orgId: string): Promise<void> {
  const { data: settings } = await supabase
    .from('org_video_settings')
    .select('render_quota_used')
    .eq('org_id', orgId)
    .maybeSingle()

  const newCount = (settings?.render_quota_used ?? 0) + 1
  await supabase.from('org_video_settings').upsert({
    org_id: orgId,
    render_quota_used: newCount,
  }, { onConflict: 'org_id' })
}
