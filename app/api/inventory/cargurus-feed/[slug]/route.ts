// Public slug-based CarGurus feed: /api/inventory/cargurus-feed/[slug]
// e.g. https://dealerwyze.com/api/inventory/cargurus-feed/apollo-auto
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailableVehicles, buildCarGurusCSV } from '@/lib/inventory/feeds'

export const runtime     = 'nodejs'
export const maxDuration = 15

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!org) return new Response('Not found', { status: 404 })

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, city, state, dealer_cell_number, dealer_website_url, dealer_website_inventory_path')
    .eq('org_id', org.id)
    .maybeSingle()

  const { vehicles, error } = await getAvailableVehicles(supabase, org.id)
  if (error) return new Response('Feed temporarily unavailable', { status: 503 })

  const orgInfo = {
    bizName:  settings?.business_name  ?? org.name ?? '',
    bizCity:  settings?.city           ?? '',
    bizState: settings?.state          ?? '',
    bizPhone: settings?.dealer_cell_number ?? '',
  }

  const csv = buildCarGurusCSV(vehicles, orgInfo)
  const filename = `${slug}-inventory.csv`

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
