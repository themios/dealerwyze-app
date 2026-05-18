import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgActiveLocations, resolveLeadOutboundIdentity } from '@/lib/locations/resolve'
import type { OrgSettingsFallback, OutboundIdentity } from '@/lib/locations/types'
import { outboundIdentityToTemplateVars } from '@/lib/locations/templateVars'

const ORG_SETTINGS_SELECT =
  'business_name, business_phone, business_address, dealer_website_url, dealer_cell_number'

export async function getLeadOutboundIdentity(
  orgId: string,
  customerId: string,
  supabase: SupabaseClient,
): Promise<OutboundIdentity> {
  const [{ data: customer }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('customers')
      .select('location_id')
      .eq('id', customerId)
      .eq('user_id', orgId)
      .maybeSingle(),
    supabase
      .from('org_settings')
      .select(ORG_SETTINGS_SELECT)
      .eq('org_id', orgId)
      .maybeSingle(),
  ])

  const locations = await getOrgActiveLocations(orgId, supabase)
  const fallback: OrgSettingsFallback = {
    business_name: orgSettings?.business_name ?? null,
    business_phone: orgSettings?.business_phone ?? null,
    business_address: orgSettings?.business_address ?? null,
    dealer_website_url: orgSettings?.dealer_website_url ?? null,
  }

  return resolveLeadOutboundIdentity({
    customer: { location_id: customer?.location_id ?? null },
    locations,
    orgSettings: fallback,
  })
}

/** Template vars for a lead, with location → org fallback. Never throws. */
export async function getLeadOutboundTemplateVars(
  orgId: string,
  customerId: string,
  supabase: SupabaseClient,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  try {
    const identity = await getLeadOutboundIdentity(orgId, customerId, supabase)
    const [{ data: orgSettings }] = await Promise.all([
      supabase.from('org_settings').select('dealer_cell_number').eq('org_id', orgId).maybeSingle(),
    ])
    const vars = outboundIdentityToTemplateVars(identity, extra)
    // Sequences historically used dealer_cell_number for {dealerPhone} in some paths
    if (!identity.phone && orgSettings?.dealer_cell_number) {
      vars.dealerPhone = orgSettings.dealer_cell_number
      vars.business_phone = orgSettings.dealer_cell_number
    }
    return vars
  } catch {
    return outboundIdentityToTemplateVars(
      {
        name: '',
        phone: null,
        address: null,
        inventory_url: null,
        location_id: null,
      },
      extra,
    )
  }
}
