import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types/index'
import type { DealerLocation, OrgSettingsFallback, OutboundIdentity } from '@/lib/locations/types'

export type { DealerLocation, OrgSettingsFallback, OutboundIdentity } from '@/lib/locations/types'

export async function getOrgActiveLocations(
  orgId: string,
  supabase: SupabaseClient,
): Promise<DealerLocation[]> {
  const { data, error } = await supabase
    .from('dealer_locations')
    .select('id, org_id, name, address, phone, inventory_url, sms_number, email_from_name, is_active, sort_order')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return []
  return (data ?? []) as DealerLocation[]
}

export async function isMultiLocationOrg(
  orgId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const locations = await getOrgActiveLocations(orgId, supabase)
  return locations.length >= 2
}

export function resolveLeadLocation(
  customer: { location_id: string | null },
  locations: DealerLocation[],
): DealerLocation | null {
  if (!customer.location_id) return null
  return locations.find(l => l.id === customer.location_id) ?? null
}

export function resolveLeadOutboundIdentity(params: {
  customer: { location_id: string | null }
  locations: DealerLocation[]
  orgSettings: OrgSettingsFallback
}): OutboundIdentity {
  const { customer, locations, orgSettings } = params
  const location = resolveLeadLocation(customer, locations)

  if (!location) {
    return {
      name: orgSettings.business_name ?? '',
      phone: orgSettings.business_phone ?? null,
      address: orgSettings.business_address ?? null,
      inventory_url: orgSettings.dealer_website_url ?? null,
      location_id: null,
    }
  }

  return {
    name: location.name ?? orgSettings.business_name ?? '',
    phone: location.phone ?? orgSettings.business_phone ?? null,
    address: location.address ?? orgSettings.business_address ?? null,
    inventory_url: location.inventory_url ?? orgSettings.dealer_website_url ?? null,
    location_id: location.id,
  }
}

export async function resolveAssignableStaff(
  orgId: string,
  locationId: string | null,
  supabase: SupabaseClient,
): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('id, display_name, role, org_id, created_at')
    .eq('org_id', orgId)
    .eq('role', 'dealer_rep')
    .is('deactivated_at', null)

  if (locationId !== null) {
    query = query.eq('location_id', locationId)
  }

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as Profile[]
}
