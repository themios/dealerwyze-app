/**
 * PATCH /api/vehicles/[id]/photos/reorder
 * Body: { orderedIds: string[] } — full permutation of this vehicle's photo ids; positions set to 0..n-1.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const orderedIds = (body as { orderedIds?: unknown }).orderedIds
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds must be a non-empty array' }, { status: 400 })
  }

  if (!orderedIds.every((id): id is string => typeof id === 'string' && UUID.test(id))) {
    return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return NextResponse.json({ error: 'Duplicate photo ids' }, { status: 400 })
  }

  const { data: rows } = await supabase
    .from('vehicle_photos')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)

  const existing = new Set((rows ?? []).map(r => r.id))
  if (orderedIds.length !== existing.size || !orderedIds.every(id => existing.has(id))) {
    return NextResponse.json({ error: 'orderedIds must list every photo for this vehicle exactly once' }, { status: 400 })
  }

  await Promise.all(
    orderedIds.map((photoId, position) =>
      supabase.from('vehicle_photos').update({ position }).eq('id', photoId).eq('org_id', profile.org_id),
    ),
  )

  const { data: first } = await supabase
    .from('vehicle_photos')
    .select('url')
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .order('position')
    .limit(1)
    .maybeSingle()

  await supabase
    .from('vehicles')
    .update({ photo_url: first?.url ?? null })
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
