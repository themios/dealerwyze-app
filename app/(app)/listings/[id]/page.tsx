import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import ListingQuickActions, { type ListingInterest } from '@/components/listings/ListingQuickActions'
import ShowingTimeline from './ShowingTimeline'
import ListingDetailsPanel from './ListingDetailsPanel'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPrice(p: number | null | undefined): string {
  if (!p) return 'Price on request'
  return `$${p.toLocaleString()}`
}

function propTypeLabel(t: string | null | undefined): string {
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

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params

  // Authenticate and verify RE vertical — org_id always derived from profile, never request
  const profile = await requireProfile()
  const supabase = await createClient()

  // Gate to real_estate vertical only
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (org?.vertical !== 'real_estate') {
    notFound()
  }

  // Fetch listing (scoped to org via user_id === org_id)
  // Use select('*') so Supabase's type inference doesn't fail on RE-specific column names
  const { data: listingRaw } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  // Cast to access RE-specific fields. The vehicles table includes these columns per migration 180.
  const listing = listingRaw as null | {
    id: string
    price: number | null
    property_type: string | null
    bedrooms: number | null
    bathrooms: number | null
    sqft: number | null
    lot_size: string | null
    year_built: number | null
    address_line1: string | null
    city: string | null
    state: string | null
    zip: string | null
    mls_number: string | null
    listing_type: string | null
    hoa_monthly: number | null
    showing_instructions: string | null
    ai_description: string | null
    notes: string | null
    agent_notes: string | null
    overview_enrichment_text: string | null
    market_data_json: Record<string, unknown> | null
    status: string
  }

  if (!listing) notFound()

  // Fetch Cal.com settings from org_settings — always server-side, never client-supplied
  const { data: settings } = await supabase
    .from('org_settings')
    .select('calcom_username, calcom_event_slug')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const addr = [listing.address_line1, listing.city, listing.state, listing.zip]
    .filter(Boolean)
    .join(', ')

  const isPending = listing.status === 'pending'
  const isSold = listing.status === 'sold'
  const listingInterest = (listing.market_data_json?.listing_interest as string | undefined) ?? ''
  const interest: ListingInterest =
    listingInterest === 'high' || listingInterest === 'medium' || listingInterest === 'low'
      ? listingInterest
      : ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        &larr; Back to listings
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-bold text-foreground">{addr || 'Listing'}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {isPending && (
            <span className="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
              Pending
            </span>
          )}
          {isSold && (
            <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-0.5 rounded-full font-medium">
              Sold
            </span>
          )}
        </div>
      </div>

      <p className="text-2xl font-bold mb-1">{formatPrice(listing.price)}</p>

      {/* Key stats */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-y border-border py-3 my-3">
        {listing.bedrooms != null && <span><strong>{listing.bedrooms}</strong> Beds</span>}
        {listing.bathrooms != null && <span><strong>{listing.bathrooms}</strong> Baths</span>}
        {listing.sqft && <span><strong>{listing.sqft.toLocaleString()}</strong> Sq Ft</span>}
        {listing.lot_size && <span><strong>{listing.lot_size}</strong> Lot</span>}
        {listing.year_built && <span>Built <strong>{listing.year_built}</strong></span>}
        {listing.property_type && <span>{propTypeLabel(listing.property_type)}</span>}
      </div>

      <ListingQuickActions
        listingId={listing.id}
        initialInterest={interest}
        initialShowingInstructions={listing.showing_instructions ?? ''}
        initialRealtorNotes={listing.overview_enrichment_text ?? ''}
      />

      {/* Details */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
        {listing.listing_type && (
          <>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">
              {listing.listing_type === 'sale' ? 'For Sale' : listing.listing_type === 'rental' ? 'For Rent' : 'Lease'}
            </dd>
          </>
        )}
        {listing.mls_number && (
          <>
            <dt className="text-muted-foreground">MLS #</dt>
            <dd className="font-mono">{listing.mls_number}</dd>
          </>
        )}
        {listing.hoa_monthly != null && (
          <>
            <dt className="text-muted-foreground">HOA</dt>
            <dd>${listing.hoa_monthly.toLocaleString()}/mo</dd>
          </>
        )}
      </dl>

      {/* Agent Notes (HTML formatted from import) */}
      {listing.agent_notes && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Agent Notes</h2>
          <div
            className="prose prose-sm max-w-none text-muted-foreground [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:ml-4 [&_li]:list-disc [&_strong]:text-foreground"
            dangerouslySetInnerHTML={{ __html: listing.agent_notes }}
          />
        </div>
      )}

      {/* Description (plain text fallback) */}
      {!listing.agent_notes && (listing.ai_description || listing.notes) && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground mb-1">About this property</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {listing.ai_description || listing.notes}
          </p>
        </div>
      )}

      {/* Documents and Pricing sections */}
      <ListingDetailsPanel listingId={listing.id} />

      {/* Showing timeline — RE only, gated above */}
      <ShowingTimeline
        listingId={listing.id}
        orgId={profile.org_id}
        calcomUsername={settings?.calcom_username ?? null}
        calcomEventSlug={settings?.calcom_event_slug ?? null}
      />
    </div>
  )
}
