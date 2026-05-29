import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { emitEvent } from '@/lib/intelligence/emitEvent'
import { logger } from '@/lib/logger'

const EDITABLE_FIELDS = [
  // Shared / dealer fields
  'stock_no', 'year', 'make', 'model', 'trim', 'color',
  'mileage', 'price', 'vin', 'status', 'notes', 'listing_url', 'body_style',
  // RE fields (migration 179) — safe to accept from RE orgs; ignored by dealer UI
  'property_type', 'bedrooms', 'bathrooms', 'sqft', 'lot_size', 'year_built',
  'address_line1', 'city', 'state', 'zip', 'school_district', 'subdivision',
  'mls_number', 'parcel_id', 'listing_type', 'expiration_date', 'showing_instructions',
  'commission_pct', 'co_broke_pct', 'hoa_monthly',
] as const

const MAX_AI_DESCRIPTION = 24_000
const MAX_OVERVIEW_ENRICHMENT = 32_000

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (!canAccessLedger(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field]
  }

  if ('ai_description' in body) {
    const v = body.ai_description
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: 'Invalid ai_description' }, { status: 400 })
    }
    if (typeof v === 'string' && v.length > MAX_AI_DESCRIPTION) {
      return NextResponse.json({ error: 'Overview is too long' }, { status: 400 })
    }
    patch.ai_description = v === null || v === '' ? null : v
  }

  if ('overview_enrichment_text' in body) {
    const v = body.overview_enrichment_text
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: 'Invalid overview_enrichment_text' }, { status: 400 })
    }
    if (typeof v === 'string' && v.length > MAX_OVERVIEW_ENRICHMENT) {
      return NextResponse.json({ error: 'Reference notes are too long' }, { status: 400 })
    }
    patch.overview_enrichment_text = v === null || v === '' ? null : v
  }

  if (typeof patch.vin === 'string') {
    const cleanVin = patch.vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase()
    patch.vin = cleanVin || null
    if (cleanVin.length >= 6) {
      patch.stock_no = cleanVin.slice(-6)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = await createClient()

  // Price change tracking for RE listings only.
  // Fetch current vehicle if price is being updated so we can compare values.
  if ('price' in patch) {
    const { data: currentVehicle } = await supabase
      .from('vehicles')
      .select('make, price, price_change_log, price_change_count')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single()

    if (
      currentVehicle &&
      currentVehicle.make === 'RE' &&
      patch.price !== undefined &&
      patch.price !== currentVehicle.price
    ) {
      const changeEntry = {
        from: currentVehicle.price,
        to: patch.price,
        changed_at: new Date().toISOString(),
      }
      // Append to existing log array; initialise to [] if null
      const existingLog = Array.isArray(currentVehicle.price_change_log)
        ? currentVehicle.price_change_log
        : []
      patch.price_change_log = [...existingLog, changeEntry]
      patch.price_change_count = ((currentVehicle.price_change_count as number | null) ?? 0) + 1
    }
  }

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select('id')
    .single()

  if (error || !vehicle) {
    if (error) logger.error('vehicles', error, { op: 'patch', id }, profile.org_id)
    return NextResponse.json({ error: 'Update failed' }, { status: 400 })
  }

  if (patch.status === 'sold') {
    emitEvent({
      orgId:      profile.org_id,
      eventType:  'vehicle_sold',
      entityType: 'vehicle',
      entityId:   id,
      actorId:    profile.id,
      metadata:   { price: patch.price ?? null },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
