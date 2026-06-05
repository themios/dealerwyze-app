import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import {
  buildCustomerIdByContactMap,
  resolveCustomerIdFromMaps,
} from '@/lib/customers/resolveCustomerByContact'
import ShowingsDashboardLoader from './ShowingsDashboardLoader'
import type { ShowingRequest } from './ShowingsDashboard'
import type { ShowingCustomerDossier } from '@/components/showings/ShowingDossierPanel'
// Note: translations are handled in the client component ShowingsDashboard

export const dynamic = 'force-dynamic'

/**
 * /app/showings — RealtyWyze buyer showing request dashboard.
 *
 * Real estate vertical only. Dealers are redirected via notFound().
 * Agents view pending/confirmed/completed/no-show buyer showing requests.
 * Data is fetched server-side and passed to the client island for filtering and status updates.
 */
export default async function ShowingsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Vertical gate — real_estate only. Return 404 so dealer orgs cannot discover this page.
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (org?.vertical !== 'real_estate') {
    notFound()
  }

  // Fetch all showing requests for this agent
  // org_id is always from profile — never request-supplied.
  const { data: showings, error } = await supabase
    .from('showing_requests')
    .select(`
      id, status, buyer_name, buyer_email, buyer_phone,
      requested_time_1, requested_time_2, requested_time_3,
      confirmed_time, confirmed_at,
      listing_id,
      listing:vehicles(
        id, address_line1, city, state, zip, price, bedrooms, bathrooms, sqft,
        property_type, mls_number, status, showing_instructions, agent_notes,
        overview_enrichment_text, market_data_json
      ),
      agent_id,
      message,
      created_at,
      updated_at
    `)
    .eq('org_id', profile.org_id)
    .eq('agent_id', profile.id)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[showings/page] fetch error:', error.message)
  }

  const customerMaps = await buildCustomerIdByContactMap(supabase, profile.org_id)

  const showingRequests = (showings ?? []).map((showing: {
    buyer_email: string
    buyer_phone: string | null
    listing?: unknown
    [key: string]: unknown
  }) => {
    const rawListing = Array.isArray(showing.listing) ? showing.listing[0] ?? null : showing.listing
    const listing =
      rawListing && typeof rawListing === 'object'
        ? {
            ...(rawListing as Record<string, unknown>),
            listing_interest:
              (rawListing as { market_data_json?: { listing_interest?: string } }).market_data_json
                ?.listing_interest ?? null,
          }
        : null
    return {
      ...showing,
      listing,
      customer_id: resolveCustomerIdFromMaps(
        { email: showing.buyer_email, phone: showing.buyer_phone },
        customerMaps,
      ),
    }
  }) as ShowingRequest[]

  const customerIds = [
    ...new Set(showingRequests.map((s) => s.customer_id).filter((id): id is string => !!id)),
  ]
  const customersById: Record<string, ShowingCustomerDossier> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select(
        'id, name, email, primary_phone, interested_in, lead_source, notes, lead_intent_tier',
      )
      .eq('user_id', profile.org_id)
      .in('id', customerIds)
    for (const c of customers ?? []) {
      customersById[c.id] = c as ShowingCustomerDossier
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Showing Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a request to open the dossier — buyer and property side by side. Confirm times,
          collect feedback, track no-shows.
        </p>
      </div>

      <ShowingsDashboardLoader
        initialShowings={showingRequests}
        customersById={customersById}
      />
    </div>
  )
}
