import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Determines which profile ID to assign a new lead to, based on the org's
 * lead_assignment_mode setting:
 *   'owner'       — always assign to the dealer_admin (org owner)
 *   'round_robin' — rotate through active dealer_rep + dealer_manager profiles
 *   'manual'      — return null (owner assigns manually)
 */
export async function resolveLeadAssignee(orgId: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('lead_assignment_mode, lead_assignment_rep_index')
    .eq('org_id', orgId)
    .maybeSingle()

  const mode = settings?.lead_assignment_mode ?? 'owner'

  if (mode === 'manual') return null

  // Get all active profiles for this org
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('org_id', orgId)
    .is('deactivated_at', null)

  if (!profiles?.length) return null

  if (mode === 'owner') {
    const owner = profiles.find(p => p.role === 'dealer_admin' || p.role === 'admin')
    return owner?.id ?? profiles[0].id
  }

  // round_robin — rotate through reps + managers (exclude dealer_admin so owner isn't in rotation unless solo)
  const reps = profiles.filter(p => p.role === 'dealer_rep' || p.role === 'dealer_manager')
  const pool = reps.length > 0 ? reps : profiles // fallback to all if no reps

  const currentIndex = settings?.lead_assignment_rep_index ?? 0
  const nextIndex = (currentIndex + 1) % pool.length
  const assignee = pool[currentIndex % pool.length]

  // Advance the index (fire-and-forget)
  supabase
    .from('org_settings')
    .update({ lead_assignment_rep_index: nextIndex })
    .eq('org_id', orgId)
    .then(() => {})

  return assignee.id
}
