/**
 * GET /api/vehicles/unchecked
 * Returns available/pending vehicles that need market intelligence run:
 * - Never had a market check (market_data_json IS NULL), OR
 * - Have market data but are missing the full compound report (marketIntelReport empty).
 * Used by the "Run Market Intelligence" batch button on the inventory page.
 * The 7-day cache is enforced per-vehicle inside the market-check endpoint.
 */
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'

export async function GET() {
  const profile = await requireProfile()
  // Auth client (forRequest): RLS enforces org isolation for both vehicle queries used to build the unchecked list.
  const supabase = await createClientForRequest()

  // Vehicles with no market data at all
  const { data: noData, error: e1 } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim')
    .eq('user_id', profile.org_id)
    .in('status', ['available', 'pending'])
    .is('market_data_json', null)
    .order('created_at', { ascending: true })
    .limit(100)

  // Vehicles with market data but missing the full compound report
  const { data: noReport, error: e2 } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim')
    .eq('user_id', profile.org_id)
    .in('status', ['available', 'pending'])
    .not('market_data_json', 'is', null)
    .filter('market_data_json->>marketIntelReport', 'is', null)
    .order('created_at', { ascending: true })
    .limit(100)

  if (e1 || e2) return NextResponse.json({ error: 'Failed to load vehicles' }, { status: 500 })

  // Merge + deduplicate by id
  const seen = new Set<string>()
  const vehicles = [...(noData ?? []), ...(noReport ?? [])].filter(v => {
    if (seen.has(v.id)) return false
    seen.add(v.id)
    return true
  }).slice(0, 100)

  return NextResponse.json({ vehicles })
}
