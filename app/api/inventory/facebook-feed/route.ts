// Public endpoint — Facebook Business Manager polls this URL from a catalog data feed.
// No auth: feed contains only public listing data.
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailableVehicles, buildFacebookCSV } from '@/lib/inventory/feeds'

export const runtime     = 'nodejs'
export const maxDuration = 15

export async function GET() {
  const supabase = createServiceClient()
  const orgId    = process.env.APOLLO_USER_ID
  if (!orgId) return new Response('Not configured', { status: 500 })

  const { vehicles, error } = await getAvailableVehicles(supabase, orgId)
  // M4: return 503 on DB error so crawlers retry rather than treating empty CSV as "zero inventory"
  if (error) return new Response('Feed temporarily unavailable', { status: 503 })

  const csv = buildFacebookCSV(vehicles)

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="apollo-facebook-catalog.csv"',
      'Cache-Control':       'no-store',
    },
  })
}
