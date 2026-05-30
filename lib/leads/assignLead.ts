import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { isMultiLocationOrg } from '@/lib/locations/resolve'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

/**
 * Determines which profile ID to assign a new lead to, based on the org's
 * lead_assignment_mode setting:
 *   'owner'       — always assign to the dealer_admin (org owner)
 *   'round_robin' — rotate through active dealer_rep + dealer_manager profiles
 *   'manual'      — return null (owner assigns manually)
 *
 * Multi-location orgs: round-robin uses `dealer_locations.round_robin_index` and
 * only staff at `lead.location_id`. Unresolved leads (null location_id) skip auto-assignment.
 * Single-location orgs: unchanged — org-wide `lead_assignment_rep_index` on org_settings.
 */
export type ResolveLeadAssigneeOptions = {
  locationId?: string | null
}

const REP_ROLES = new Set(['dealer_rep', 'dealer_manager'])

export async function resolveLeadAssignee(
  orgId: string,
  options?: ResolveLeadAssigneeOptions,
): Promise<string | null> {
  const supabase = createServiceClient()
  const multi = await isMultiLocationOrg(orgId, supabase)

  if (multi && !options?.locationId) {
    return null
  }

  const { data: settings } = await supabase
    .from('org_settings')
    .select('lead_assignment_mode, lead_assignment_rep_index')
    .eq('org_id', orgId)
    .maybeSingle()

  const mode = settings?.lead_assignment_mode ?? 'owner'

  if (mode === 'manual') return null

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, location_id')
    .eq('org_id', orgId)
    .is('deactivated_at', null)

  if (!profiles?.length) return null

  if (mode === 'owner') {
    const owner = profiles.find(p => isDealerAdmin(p.role as UserRole))
    return owner?.id ?? profiles[0].id
  }

  // round_robin
  let pool = profiles.filter(p => REP_ROLES.has(p.role))
  if (multi && options?.locationId) {
    pool = pool.filter(p => p.location_id === options.locationId)
  }
  const rotationPool = pool.length > 0 ? pool : profiles

  if (rotationPool.length === 0) return null

  if (!multi) {
    const currentIndex = settings?.lead_assignment_rep_index ?? 0
    const nextIndex = (currentIndex + 1) % rotationPool.length
    const assignee = rotationPool[currentIndex % rotationPool.length]

    supabase
      .from('org_settings')
      .update({ lead_assignment_rep_index: nextIndex })
      .eq('org_id', orgId)
      .then(() => {})

    return assignee.id
  }

  const locationId = options!.locationId!
  const { data: location } = await supabase
    .from('dealer_locations')
    .select('id, round_robin_index')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!location || pool.length === 0) return null

  const currentIndex = location.round_robin_index ?? 0
  const nextIndex = (currentIndex + 1) % pool.length
  const assignee = pool[currentIndex % pool.length]

  supabase
    .from('dealer_locations')
    .update({ round_robin_index: nextIndex })
    .eq('id', locationId)
    .then(() => {})

  return assignee.id
}

/** Assign a new lead after location detection (ingest). Skips if already assigned or captured by staff. */
export async function applyAutoLeadAssignment(params: {
  customerId: string
  orgId: string
  capturedByUserId?: string
  supabase?: SupabaseClient
}): Promise<void> {
  if (params.capturedByUserId) return

  try {
    const supabase = params.supabase ?? createServiceClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('assigned_to, location_id')
      .eq('id', params.customerId)
      .eq('user_id', params.orgId)
      .maybeSingle()

    if (!customer || customer.assigned_to) return

    const assignee = await resolveLeadAssignee(params.orgId, {
      locationId: customer.location_id ?? null,
    })
    if (!assignee) return

    await supabase
      .from('customers')
      .update({ assigned_to: assignee })
      .eq('id', params.customerId)
  } catch {
    // Non-fatal — ingest must not fail
  }
}
