import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { loadOrganizationsMatchingPublicSlug, pickUniqueOrgSlugMatch } from '@/lib/dealer-public/publicOrgBySlug'
import ShowingRequestForm from './ShowingRequestForm'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string; id: string }> }

const ORG_SELECT = `id, name, slug, vertical, public_inventory_enabled, website_robots_noindex, website_contact_email, website_contact_phone`

interface OrgRow {
  id: string
  name: string
  slug: string
  vertical: string | null
  public_inventory_enabled: boolean | null
  website_robots_noindex: boolean | null
  website_contact_email: string | null
  website_contact_phone: string | null
}

function normalizeSlugParam(s: string) {
  try { return decodeURIComponent(s).trim() } catch { return s.trim() }
}

function formatPrice(p: number | null): string {
  if (!p) return 'Price on request'
  return `$${p.toLocaleString()}`
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  const supabase = createServiceClient()
  const { rows } = await loadOrganizationsMatchingPublicSlug(supabase, normalizeSlugParam(slug), ORG_SELECT, { onlyPublicInventory: false })
  const { row: org } = pickUniqueOrgSlugMatch(rows as unknown as OrgRow[], normalizeSlugParam(slug))
  if (!org) return {}

  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, price, property_type, bedrooms, bathrooms, sqft, photo_url, description')
    .eq('id', id)
    .eq('user_id', org.id)
    .maybeSingle()

  if (!listing) return {}
  const addr = [listing.address_line1, listing.city, listing.state].filter(Boolean).join(', ')
  const details = [
    listing.bedrooms ? `${listing.bedrooms} bed` : null,
    listing.bathrooms ? `${listing.bathrooms} bath` : null,
    listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : null,
  ].filter(Boolean).join(', ')

  return {
    title: `${addr || 'Listing'} - ${formatPrice(listing.price)} - ${org.name}`,
    description: listing.description || `${propTypeLabel(listing.property_type)}${details ? ' - ' + details : ''} listed at ${formatPrice(listing.price)} by ${org.name}`,
    robots: org.website_robots_noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: `${addr} - ${formatPrice(listing.price)}`,
      description: listing.description || `${propTypeLabel(listing.property_type)}${details ? ' - ' + details : ''}`,
      type: 'website',
      images: listing.photo_url ? [{ url: listing.photo_url, width: 1200, height: 628 }] : [],
    },
  }
}

export default async function ListingDetailPage({ params }: Props) {
  const { slug, id } = await params
  const supabase = createServiceClient()
  const slugNorm = normalizeSlugParam(slug)

  const { rows, error } = await loadOrganizationsMatchingPublicSlug(supabase, slugNorm, ORG_SELECT, { onlyPublicInventory: false })
  const { row: org } = pickUniqueOrgSlugMatch(rows as unknown as OrgRow[], slugNorm)

  if (error || !org || org.public_inventory_enabled !== true || org.vertical !== 'real_estate') {
    notFound()
  }

  const { data: listing } = await supabase
    .from('vehicles')
    .select('id, photo_url, price, property_type, bedrooms, bathrooms, sqft, lot_size, year_built, address_line1, city, state, zip, school_district, subdivision, mls_number, listing_type, hoa_monthly, showing_instructions, ai_description, description, notes, status, dom, listing_status, price_history, mls_synced_at, mls_source')
    .eq('id', id)
    .eq('user_id', org.id)
    .maybeSingle()

  if (!listing) notFound()

  const addr = [listing.address_line1, listing.city, listing.state, listing.zip].filter(Boolean).join(', ')
  const isPending = listing.status === 'pending'
  const isSold = listing.status === 'sold'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${slugNorm}/listings`} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; All Listings
      </Link>

      {/* Photos */}
      {listing.photo_url ? (
        <div className="rounded-lg overflow-hidden aspect-[16/9] mb-6 bg-gray-100">
          <img src={listing.photo_url} alt={addr} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="rounded-lg bg-gray-100 aspect-[16/9] mb-6 flex items-center justify-center text-gray-400">No photo available</div>
      )}

      {/* Status badge */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{addr}</h1>
        {isPending && <span className="shrink-0 bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full font-medium">Pending</span>}
        {isSold && <span className="shrink-0 bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full font-medium">Sold</span>}
      </div>

      <p className="text-3xl font-bold text-gray-900 mb-1">{formatPrice(listing.price)}</p>

      {/* Key stats */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-700 my-4 border-y border-gray-100 py-4">
        {listing.bedrooms != null && <span><strong>{listing.bedrooms}</strong> Beds</span>}
        {listing.bathrooms != null && <span><strong>{listing.bathrooms}</strong> Baths</span>}
        {listing.sqft && <span><strong>{listing.sqft.toLocaleString()}</strong> Sq Ft</span>}
        {listing.lot_size && <span><strong>{listing.lot_size}</strong> Lot</span>}
        {listing.year_built && <span>Built <strong>{listing.year_built}</strong></span>}
        {listing.property_type && <span>{propTypeLabel(listing.property_type)}</span>}
      </div>

      {/* MLS & Status Details */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700 mb-6">
        {listing.listing_type && (
          <>
            <dt className="text-gray-500">Type</dt>
            <dd className="capitalize">{listing.listing_type === 'sale' ? 'For Sale' : listing.listing_type === 'rental' ? 'For Rent' : 'Lease'}</dd>
          </>
        )}
        {listing.mls_number && (
          <>
            <dt className="text-gray-500">MLS #</dt>
            <dd className="font-mono font-semibold">{listing.mls_number}</dd>
          </>
        )}
        {listing.mls_source && listing.mls_source === 'bridge' && listing.listing_status && (
          <>
            <dt className="text-gray-500">MLS Status</dt>
            <dd className="capitalize">{listing.listing_status}</dd>
          </>
        )}
        {listing.dom != null && (
          <>
            <dt className="text-gray-500">Days on Market</dt>
            <dd>{listing.dom} day{listing.dom !== 1 ? 's' : ''}</dd>
          </>
        )}
        {listing.hoa_monthly != null && (
          <>
            <dt className="text-gray-500">HOA</dt>
            <dd>${listing.hoa_monthly.toLocaleString()}/mo</dd>
          </>
        )}
        {listing.school_district && (
          <>
            <dt className="text-gray-500">School District</dt>
            <dd>{listing.school_district}</dd>
          </>
        )}
        {listing.subdivision && (
          <>
            <dt className="text-gray-500">Subdivision</dt>
            <dd>{listing.subdivision}</dd>
          </>
        )}
      </dl>

      {/* Description — prioritize MLS description if available */}
      {(listing.description || listing.ai_description || listing.notes) && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">About this property</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {listing.description || listing.ai_description || listing.notes}
          </p>
        </div>
      )}

      {/* Showing instructions */}
      {listing.showing_instructions && (
        <div className="mb-8 bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">Showing Instructions</h3>
          <p className="text-sm text-blue-800">{listing.showing_instructions}</p>
        </div>
      )}

      {/* Contact form */}
      {!isSold && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule a Showing</h2>
          <ShowingRequestForm
            orgId={org.id}
            listingId={listing.id}
            address={addr}
            orgName={org.name}
          />
        </div>
      )}
    </div>
  )
}
