// Public endpoint — CarGurus polls this URL from their dealer portal.
// No auth: feed contains only public listing data (price, year/make/model, photo).
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailableVehicles, buildCarGurusCSV } from '@/lib/inventory/feeds'

export const runtime     = 'nodejs'
export const maxDuration = 15

export async function GET() {
  const supabase = createServiceClient()
  const orgId    = process.env.APOLLO_USER_ID
  if (!orgId) return new Response('Not configured', { status: 500 })

  const { vehicles, error } = await getAvailableVehicles(supabase, orgId)
  // M4: return 503 on DB error so crawlers retry rather than treating empty CSV as "zero inventory"
  if (error) return new Response('Feed temporarily unavailable', { status: 503 })

  const csv = buildCarGurusCSV(vehicles)

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="apollo-inventory.csv"',
      'Cache-Control':       'no-store',
    },
  })
}
