import type { OutboundIdentity } from '@/lib/locations/types'

/**
 * Maps resolved outbound identity to template placeholders.
 * Spec names ({business_name}, etc.) plus legacy aliases ({dealerName}, {link}, …).
 */
export function outboundIdentityToTemplateVars(
  identity: OutboundIdentity,
  extra: Record<string, string> = {},
): Record<string, string> {
  const name = identity.name ?? ''
  const phone = identity.phone ?? ''
  const address = identity.address ?? ''
  const inventory = identity.inventory_url ?? ''

  return {
    business_name: name,
    business_phone: phone,
    business_address: address,
    inventory_link: inventory,
    dealerName: name,
    dealerPhone: phone,
    dealerAddress: address,
    link: inventory,
    ...extra,
  }
}
