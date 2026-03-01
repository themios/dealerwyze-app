import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAvailableVehicles, buildCarGurusCSV, buildFacebookCSV } from '@/lib/inventory/feeds'

export const runtime     = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const orgId    = process.env.APOLLO_USER_ID
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 500 })

  const { vehicles, error: fetchError } = await getAvailableVehicles(supabase, orgId)
  if (fetchError) {
    return NextResponse.json({ error: `DB fetch failed: ${fetchError}` }, { status: 500 })
  }

  const now = new Date().toISOString()

  let cgCount: number | null = null
  let cgError: string | null = null
  let fbCount: number | null = null
  let fbError: string | null = null

  // Smoke-test CarGurus CSV: build + verify row count (M2)
  try {
    const csv = buildCarGurusCSV(vehicles)
    // Subtract header row and trailing empty entry from CRLF split
    const dataRows = csv.split('\r\n').filter(Boolean).length - 1
    if (dataRows !== vehicles.length) {
      cgError = `Row count mismatch: expected ${vehicles.length}, got ${dataRows}`
    } else {
      cgCount = dataRows
    }
  } catch (e: unknown) {
    cgError = e instanceof Error ? e.message : String(e)
    console.error('[sync-inventory] CarGurus CSV build error:', cgError)
  }

  // Smoke-test Facebook CSV: build + verify row count (M2)
  try {
    const csv = buildFacebookCSV(vehicles)
    const dataRows = csv.split('\r\n').filter(Boolean).length - 1
    if (dataRows !== vehicles.length) {
      fbError = `Row count mismatch: expected ${vehicles.length}, got ${dataRows}`
    } else {
      fbCount = dataRows
    }
  } catch (e: unknown) {
    fbError = e instanceof Error ? e.message : String(e)
    console.error('[sync-inventory] Facebook CSV build error:', fbError)
  }

  // M1: preserve last successful synced_at — only overwrite it on success
  const cgUpdate = cgError
    ? { feed_cg_last_error: cgError, feed_cg_last_count: null }
    : { feed_cg_last_synced_at: now, feed_cg_last_count: cgCount, feed_cg_last_error: null }

  const fbUpdate = fbError
    ? { feed_fb_last_error: fbError, feed_fb_last_count: null }
    : { feed_fb_last_synced_at: now, feed_fb_last_count: fbCount, feed_fb_last_error: null }

  const { error: updateError } = await supabase
    .from('org_settings')
    .update({ ...cgUpdate, ...fbUpdate })
    .eq('org_id', orgId)

  if (updateError) {
    console.error('[sync-inventory] org_settings update error:', updateError)
  }

  return NextResponse.json({
    vehicles:  vehicles.length,
    cargurus:  { count: cgCount, error: cgError },
    facebook:  { count: fbCount, error: fbError },
  })
}
