import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import ShowingsDashboard, { type UpcomingShowing } from './ShowingsDashboard'

export const dynamic = 'force-dynamic'

/**
 * /showings — Cross-listing upcoming showings dashboard.
 *
 * Real estate vertical only. Dealers are redirected via notFound().
 * Data is fetched server-side (no HTTP round-trip to /api/showings/upcoming)
 * and passed to the client island for filtering and status updates.
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

  // Fetch upcoming showings: next 30 days, up to 500 rows, soonest first.
  // org_id always from profile — never request-supplied.
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + 30)

  const { data: showings, error } = await supabase
    .from('showings')
    .select(`
      id, scheduled_at, status, org_id, listing_id,
      listing:vehicles(id, address_line1, city, state, zip),
      contact:customers(id, name, primary_phone),
      agent:profiles(id, full_name)
    `)
    .eq('org_id', profile.org_id)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', cutoff.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[showings/page] fetch error:', error.message)
  }

  // Cast to UpcomingShowing[] — Supabase's type inference fails on joined RE-specific columns.
  // The schema is guaranteed by migration 192.
  const upcomingShowings = (showings ?? []) as unknown as UpcomingShowing[]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Upcoming Showings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All showings across your listings for the next 30 days.
        </p>
      </div>

      <ShowingsDashboard initialShowings={upcomingShowings} />
    </div>
  )
}
