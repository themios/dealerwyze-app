import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailableVehicles, buildCarGurusCSV, buildFacebookCSV, OrgInfo } from '@/lib/inventory/feeds'

export const runtime     = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch all orgs that have at least a slug (active tenants)
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .not('slug', 'is', null)

  if (!orgs?.length) {
    return NextResponse.json({ error: 'No orgs found' }, { status: 500 })
  }

  // Fetch org_settings for all orgs in one query
  const orgIds = orgs.map(o => o.id)
  const { data: allSettings } = await supabase
    .from('org_settings')
    .select('org_id, business_name, city, state, dealer_cell_number')
    .in('org_id', orgIds)

  const settingsMap = new Map((allSettings ?? []).map(s => [s.org_id, s]))

  const now = new Date().toISOString()
  const results: Record<string, unknown>[] = []

  for (const org of orgs) {
    const s = settingsMap.get(org.id)
    const orgInfo: OrgInfo = {
      bizName:  s?.business_name ?? org.name ?? 'Dealer',
      bizCity:  s?.city ?? '',
      bizState: s?.state ?? 'CA',
      bizPhone: s?.dealer_cell_number ?? '',
    }

    const { vehicles, error: fetchError } = await getAvailableVehicles(supabase, org.id)
    if (fetchError) {
      results.push({ org: org.slug, error: `DB fetch failed: ${fetchError}` })
      continue
    }

    let cgCount: number | null = null
    let cgError: string | null = null
    let fbCount: number | null = null
    let fbError: string | null = null

    try {
      const csv = buildCarGurusCSV(vehicles, orgInfo)
      const dataRows = csv.split('\r\n').filter(Boolean).length - 1
      if (dataRows !== vehicles.length) {
        cgError = `Row count mismatch: expected ${vehicles.length}, got ${dataRows}`
      } else {
        cgCount = dataRows
      }
    } catch (e: unknown) {
      cgError = e instanceof Error ? e.message : String(e)
    }

    try {
      const csv = buildFacebookCSV(vehicles, orgInfo)
      const dataRows = csv.split('\r\n').filter(Boolean).length - 1
      if (dataRows !== vehicles.length) {
        fbError = `Row count mismatch: expected ${vehicles.length}, got ${dataRows}`
      } else {
        fbCount = dataRows
      }
    } catch (e: unknown) {
      fbError = e instanceof Error ? e.message : String(e)
    }

    const cgUpdate = cgError
      ? { feed_cg_last_error: cgError, feed_cg_last_count: null }
      : { feed_cg_last_synced_at: now, feed_cg_last_count: cgCount, feed_cg_last_error: null }

    const fbUpdate = fbError
      ? { feed_fb_last_error: fbError, feed_fb_last_count: null }
      : { feed_fb_last_synced_at: now, feed_fb_last_count: fbCount, feed_fb_last_error: null }

    await supabase
      .from('org_settings')
      .update({ ...cgUpdate, ...fbUpdate })
      .eq('org_id', org.id)

    results.push({ org: org.slug, vehicles: vehicles.length, cargurus: { count: cgCount, error: cgError }, facebook: { count: fbCount, error: fbError } })
  }

  return NextResponse.json({ orgs_processed: results.length, results })
}
