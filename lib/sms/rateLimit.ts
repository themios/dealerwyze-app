import { createServiceClient } from '@/lib/supabase/service'

const MAX_PER_MINUTE = 50

export async function checkRateLimit(orgId: string): Promise<{ allowed: boolean; count: number }> {
  const supabase = createServiceClient()
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString()

  const { count } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('type', 'sms')
    .eq('direction', 'outbound')
    .gte('created_at', oneMinAgo)

  const current = count ?? 0
  return { allowed: current < MAX_PER_MINUTE, count: current }
}
