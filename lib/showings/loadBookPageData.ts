import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadOrganizationsMatchingPublicSlug,
  pickUniqueOrgSlugMatch,
} from '@/lib/dealer-public/publicOrgBySlug'

export interface BookListingOption {
  id: string
  label: string
  addressLine1: string | null
  city: string | null
  state: string | null
  price: number | null
}

export interface BookPageAgent {
  id: string
  displayName: string
  photoUrl: string | null
}

export interface BookPageData {
  org: {
    id: string
    name: string
    slug: string
    websiteLogoUrl: string | null
  }
  agent: BookPageAgent | null
  listings: BookListingOption[]
}

const ORG_SELECT =
  'id, name, slug, vertical, public_inventory_enabled, website_logo_url'

function normalizeSlugParam(s: string): string {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

function formatListingLabel(row: {
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  price: number | null
}): string {
  const addr = [row.address_line1, row.city, row.state, row.zip]
    .filter(Boolean)
    .join(', ')
  const price =
    row.price != null && row.price > 0
      ? ` — $${row.price.toLocaleString()}`
      : ''
  return `${addr || 'Property'}${price}`
}

export async function loadBookPageData(
  supabase: SupabaseClient,
  slugParam: string,
): Promise<BookPageData | null> {
  const slugNorm = normalizeSlugParam(slugParam)
  if (!slugNorm) return null

  const { rows, error } = await loadOrganizationsMatchingPublicSlug(
    supabase,
    slugNorm,
    ORG_SELECT,
    { onlyPublicInventory: false },
  )
  if (error) return null

  const { row: org } = pickUniqueOrgSlugMatch(
    rows as Array<{
      id: string
      name: string
      slug: string
      vertical: string | null
      public_inventory_enabled: boolean | null
      website_logo_url: string | null
    }>,
    slugNorm,
  )

  if (!org || org.vertical !== 'real_estate') return null

  const { data: listingRows } = await supabase
    .from('vehicles')
    .select('id, address_line1, city, state, zip, price, listing_agent_id')
    .eq('user_id', org.id)
    .in('status', ['available', 'pending'])
    .order('city', { ascending: true })
    .limit(200)

  const listings: BookListingOption[] = (listingRows ?? []).map((row) => ({
    id: row.id,
    label: formatListingLabel(row),
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    price: row.price,
  }))

  let agent: BookPageAgent | null = null
  const agentId =
    listingRows?.[0]?.listing_agent_id ??
    org.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', agentId)
    .eq('org_id', org.id)
    .maybeSingle()

  if (profile) {
    agent = {
      id: profile.id,
      displayName: profile.display_name?.trim() || org.name,
      photoUrl: org.website_logo_url ?? null,
    }
  } else {
    agent = {
      id: org.id,
      displayName: org.name,
      photoUrl: org.website_logo_url ?? null,
    }
  }

  return {
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      websiteLogoUrl: org.website_logo_url,
    },
    agent,
    listings,
  }
}

export { normalizeSlugParam }
