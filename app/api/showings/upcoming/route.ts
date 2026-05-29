import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

export const runtime = 'nodejs'

/**
 * GET /api/showings/upcoming
 *
 * Returns all upcoming showings for the authenticated agent's org, across all listings.
 * Scoped to the authenticated org via RLS + explicit eq('org_id', ...).
 * Capped to 30 days ahead and a hard limit of 500 rows (per enterprise constraints).
 *
 * Real estate vertical only — caller (page) is responsible for the vertical gate,
 * but org_id scoping means a dealer org would simply get an empty array.
 */
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + 30)

  const { data, error } = await supabase
    .from('showings')
    .select(`
      id, scheduled_at, status, org_id, listing_id, agent_id,
      listing:vehicles(id, address_line1, city, state, zip),
      contact:customers(id, name, primary_phone)
    `)
    .eq('org_id', profile.org_id)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', cutoff.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[showings/upcoming] fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch upcoming showings' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
