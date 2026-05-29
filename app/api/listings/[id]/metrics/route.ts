/**
 * GET /api/listings/[id]/metrics
 * LIST-04 — Listing performance metrics.
 *
 * Returns days_on_market, showing_count, price_change_count, price_change_log,
 * current_price, and status for a RE listing. showing_count and price change
 * fields are denormalized on the vehicles row (populated by triggers from
 * migrations 189/191).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Vertical guard — RE orgs only
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch listing — RLS + explicit user_id filter for tenant isolation
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, status, price, created_at, showing_count, price_change_count, price_change_log, listing_type')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single()

    if (!vehicle) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const days_on_market = Math.floor(
      (Date.now() - new Date(vehicle.created_at as string).getTime()) / 86_400_000,
    )

    return NextResponse.json({
      days_on_market,
      showing_count:      vehicle.showing_count ?? 0,
      price_change_count: vehicle.price_change_count ?? 0,
      price_change_log:   vehicle.price_change_log ?? null,
      current_price:      vehicle.price ?? null,
      status:             vehicle.status,
    })
  } catch (_err) {
    console.error('[listings/metrics] error:', _err instanceof Error ? _err.message : _err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
