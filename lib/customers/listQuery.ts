import type { SupabaseClient } from '@supabase/supabase-js'

/** Apply optional location filter: UUID, `unassigned`, or omit for all. */
export function applyCustomerLocationFilter<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  locationIdParam: string | null | undefined,
): T {
  if (!locationIdParam) return query
  if (locationIdParam === 'unassigned') return query.is('location_id', null)
  return query.eq('location_id', locationIdParam)
}

export async function isValidOrgLocationId(
  supabase: SupabaseClient,
  orgId: string,
  locationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('dealer_locations')
    .select('id')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}
