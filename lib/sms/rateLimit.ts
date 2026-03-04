import { createServiceClient } from '@/lib/supabase/service'

// Vector 8: outbound velocity caps per org
const MAX_PER_MINUTE = 20   // 20 outbound SMS/min  (was 50 — tightened per security plan)
const MAX_PER_DAY    = 300  // 300 outbound SMS/day

export async function checkRateLimit(orgId: string): Promise<{
  allowed: boolean
  count: number
  reason?: string
}> {
  const supabase = createServiceClient()
  const now = Date.now()
  const oneMinAgo  = new Date(now - 60_000).toISOString()
  const oneDayAgo  = new Date(now - 24 * 60 * 60 * 1000).toISOString()

  // Check per-minute cap
  const { count: minCount } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('type', 'sms')
    .eq('direction', 'outbound')
    .gte('created_at', oneMinAgo)

  if ((minCount ?? 0) >= MAX_PER_MINUTE) {
    return { allowed: false, count: minCount ?? 0, reason: `Rate limit: ${minCount} messages sent in the last minute (max ${MAX_PER_MINUTE}). Try again shortly.` }
  }

  // Check per-day cap
  const { count: dayCount } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('type', 'sms')
    .eq('direction', 'outbound')
    .gte('created_at', oneDayAgo)

  if ((dayCount ?? 0) >= MAX_PER_DAY) {
    return { allowed: false, count: dayCount ?? 0, reason: `Daily limit reached: ${dayCount} messages sent in the last 24 hours (max ${MAX_PER_DAY}).` }
  }

  return { allowed: true, count: minCount ?? 0 }
}
