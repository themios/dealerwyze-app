import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { loadOrganizationsMatchingPublicSlug, pickUniqueOrgSlugMatch } from '@/lib/dealer-public/publicOrgBySlug'
import type { PropertyType } from '@/types/index'

// ISR: revalidate every 60 seconds for public listing pages
export const revalidate = 60

function normalizeSlugParam(s: string) {
  try { return decodeURIComponent(s).trim() } catch { return s.trim() }
}

type Props = { params: Promise<{ slug: string }> }

const ORG_SELECT = `id, name, slug, website_tagline, website_seo_description, website_robots_noindex, vertical, public_inventory_enabled`

interface OrgRow {
  id: string
  name: string
  slug: string
  website_tagline: string | null
  website_seo_description: string | null
  website_robots_noindex: boolean | null
  vertical: string | null
  public_inventory_enabled: boolean | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceClient()
  const { rows } = await loadOrganizationsMatchingPublicSlug(supabase, normalizeSlugParam(slug), ORG_SELECT, { onlyPublicInventory: true })
  const { row: org } = pickUniqueOrgSlugMatch(rows as unknown as OrgRow[], normalizeSlugParam(slug))
  if (!org) return {}
  return {
    title: `${org.name} - Active Listings`,
    description: org.website_seo_description ?? `Browse listings from ${org.name}`,
    robots: org.website_robots_noindex ? { index: false, follow: false } : { index: true, follow: true },
  }
}

function propTypeLabel(t: string | null): string {
  const map: Record<string, string> = {
    single_family: 'Single Family',
    condo: 'Condo',
    townhouse: 'Townhouse',
    multi_family: 'Multi-Family',
    land: 'Land',
    commercial: 'Commercial',
  }
  return t ? (map[t] ?? t) : 'Property'
}

function formatPrice(p: number | null): string {
  if (!p) return 'Price on request'
  return `$${p.toLocaleString()}`
}

function listingSummary(v: ListingRow): string {
  const parts: string[] = []
  if (v.bedrooms) parts.push(`${v.bedrooms} bd`)
  if (v.bathrooms) parts.push(`${v.bathrooms} ba`)
  if (v.sqft) parts.push(`${v.sqft.toLocaleString()} sqft`)
  return parts.join(' · ')
}

interface ListingRow {
  id: string
  photo_url: string | null
  price: number | null
  property_type: PropertyType | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  mls_number: string | null
  status: string
}

export default async function PublicListingsPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error } = await loadOrganizationsMatchingPublicSlug(supabase, slugNorm, ORG_SELECT, { onlyPublicInventory: false })
  const { row: org } = pickUniqueOrgSlugMatch(rows as unknown as OrgRow[], slugNorm)

  if (error || !org || org.public_inventory_enabled !== true || org.vertical !== 'real_estate') {
    notFound()
  }

  const { data: listings } = await supabase
    .from('vehicles')
    .select('id, photo_url, price, property_type, bedrooms, bathrooms, sqft, address_line1, city, state, zip, mls_number, status, mls_synced_at, dom')
    .eq('user_id', org.id)
    .in('status', ['available', 'pending'])
    .limit(100)

  // Sort listings: MLS first (by mls_synced_at DESC), then manual listings (by created_at DESC)
  const sortedListings = listings
    ? [...listings].sort((a, b) => {
        const aMls = a.mls_synced_at ? 1 : 0
        const bMls = b.mls_synced_at ? 1 : 0
        if (aMls !== bMls) return bMls - aMls
        return 0
      })
    : []

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
        {org.website_tagline && <p className="text-gray-600 mt-1">{org.website_tagline}</p>}
        <p className="text-sm text-gray-500 mt-2">{sortedListings?.length ?? 0} active listing{sortedListings?.length !== 1 ? 's' : ''}</p>
      </div>

      {!sortedListings?.length ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">No active listings right now.</p>
          <p className="text-sm mt-2">Check back soon or contact us directly.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedListings.map((v) => (
            <Link key={v.id} href={`/${slugNorm}/listings/${v.id}`} className="group block rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow bg-white">
              <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                {v.photo_url ? (
                  <img src={v.photo_url} alt={v.address_line1 ?? 'Listing'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No photo</div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 text-base leading-tight">{formatPrice(v.price)}</p>
                  {v.status === 'pending' && (
                    <span className="shrink-0 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">Pending</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{v.address_line1}</p>
                {(v.city || v.state) && (
                  <p className="text-xs text-gray-500">{[v.city, v.state, v.zip].filter(Boolean).join(', ')}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">{listingSummary(v as ListingRow)}</span>
                  <span className="text-xs text-gray-400">{propTypeLabel(v.property_type)}</span>
                </div>
                {v.mls_number && (
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400">MLS# {v.mls_number}</p>
                    {v.dom != null && <p className="text-xs text-gray-400">{v.dom}d</p>}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
