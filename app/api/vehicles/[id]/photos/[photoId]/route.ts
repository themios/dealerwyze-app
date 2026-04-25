/**
 * DELETE /api/vehicles/[id]/photos/[photoId]  — delete a photo
 * PATCH  /api/vehicles/[id]/photos/[photoId]  — set as primary (position 0)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'

const BUCKET = 'vehicle-photos'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const profile = await requireProfile()
  const { id: vehicleId, photoId } = await params
  // Auth client: RLS enforces org isolation for DB queries on vehicle_photos and vehicles.
  const supabase = await createClient()
  // Service client: Supabase Storage does not respect session-level RLS — service key required to delete objects.
  const service = createServiceClient()

  // Fetch photo, verify org ownership
  const { data: photo } = await supabase
    .from('vehicle_photos')
    .select('id, storage_key, position')
    .eq('id', photoId)
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .single()

  if (!photo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete from DB first
  await supabase
    .from('vehicle_photos')
    .delete()
    .eq('id', photoId)
    .eq('org_id', profile.org_id)

  // Best-effort storage cleanup
  await service.storage.from(BUCKET).remove([photo.storage_key])

  // If deleted photo was primary, update vehicles.photo_url to next photo
  if (photo.position === 0) {
    const { data: next } = await supabase
      .from('vehicle_photos')
      .select('url')
      .eq('vehicle_id', vehicleId)
      .order('position')
      .limit(1)
      .maybeSingle()

    await supabase
      .from('vehicles')
      .update({ photo_url: next?.url ?? null })
      .eq('id', vehicleId)
      .eq('user_id', profile.org_id)
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const profile = await requireProfile()
  const { id: vehicleId, photoId } = await params
  // Auth client: RLS enforces org isolation; no storage operations in PATCH — service client not needed.
  const supabase = await createClient()

  // Verify photo belongs to this org+vehicle
  const { data: photo } = await supabase
    .from('vehicle_photos')
    .select('id, url, position')
    .eq('id', photoId)
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .single()

  if (!photo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (photo.position === 0) {
    return NextResponse.json({ ok: true }) // already primary
  }

  // Get all photos for this vehicle, sorted by position
  const { data: all } = await supabase
    .from('vehicle_photos')
    .select('id, position')
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .order('position')

  if (!all) return NextResponse.json({ ok: true })

  // Rebuild positions: selected photo goes to 0, rest shift down in existing order
  const reordered = [
    { id: photoId, position: 0 },
    ...all
      .filter(p => p.id !== photoId)
      .map((p, i) => ({ id: p.id, position: i + 1 })),
  ]

  // Batch update positions
  await Promise.all(
    reordered.map(p =>
      supabase
        .from('vehicle_photos')
        .update({ position: p.position })
        .eq('id', p.id)
        .eq('org_id', profile.org_id)
    )
  )

  // Sync vehicles.photo_url
  await supabase
    .from('vehicles')
    .update({ photo_url: photo.url })
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
