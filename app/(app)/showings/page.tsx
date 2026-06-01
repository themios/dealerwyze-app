import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import ShowingsDashboard, { type ShowingRequest } from './ShowingsDashboard'
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
      listing:vehicles(id, address_line1, city, state, zip),
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

  // Map to ShowingRequest[] - normalize listing from array to object
  const showingRequests = (showings ?? []).map((showing: any) => ({
    ...showing,
    listing: Array.isArray(showing.listing) ? showing.listing[0] ?? null : showing.listing,
  })) as ShowingRequest[]

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Showing Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buyer showing requests for your listings. Confirm times, collect feedback, track no-shows.
        </p>
      </div>

      <ShowingsDashboard initialShowings={showingRequests} />
    </div>
  )
}
