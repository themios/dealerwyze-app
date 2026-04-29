/**
 * GET  /api/vehicles/[id]/photos  — list photos for a vehicle (org-scoped)
 * POST /api/vehicles/[id]/photos  — upload a photo (multipart/form-data, field: "file")
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { checkFreeTierAttachmentLimit } from '@/lib/storage/quota'

const BUCKET = 'vehicle-photos'
const MAX_SIZE_BYTES = 5 * 1024 * 1024  // 5MB (client compresses to ~800KB before sending)
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PHOTOS = 20

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const { id } = await params
  // Auth client: RLS enforces org isolation via get_org_id(); no cross-org access needed.
  const supabase = await createClient()

  const { data } = await supabase
    .from('vehicle_photos')
    .select('id, url, position, storage_key')
    .eq('vehicle_id', id)
    .eq('org_id', profile.org_id)
    .order('position')

  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params
  // Auth client: RLS enforces org isolation for DB operations on vehicle_photos and vehicles.
  const supabase = await createClient()
  // Service client: Supabase Storage does not respect session-level RLS — service key required for uploads.
  const service = createServiceClient()

  // Verify vehicle belongs to this org
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check photo count
  const { count } = await supabase
    .from('vehicle_photos')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', vehicleId)

  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos per vehicle.` }, { status: 400 })
  }

  // Free tier: only 2 vehicles may have attachments
  const attachmentError = await checkFreeTierAttachmentLimit(supabase, profile.org_id, 'vehicle', vehicleId)
  if (attachmentError) return NextResponse.json({ error: attachmentError }, { status: 403 })

  // Parse multipart
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 400 })
  }

  const photoId = crypto.randomUUID()
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storageKey = `${profile.org_id}/${vehicleId}/${photoId}.${ext}`

  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storageKey, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storageKey}`

  // Get next position
  const { data: existing } = await supabase
    .from('vehicle_photos')
    .select('position')
    .eq('vehicle_id', vehicleId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { data: photo, error: dbError } = await supabase
    .from('vehicle_photos')
    .insert({
      id: photoId,
      vehicle_id: vehicleId,
      org_id: profile.org_id,
      storage_key: storageKey,
      url,
      position: nextPosition,
    })
    .select('id, url, position')
    .single()

  if (dbError) {
    // Best-effort cleanup
    await service.storage.from(BUCKET).remove([storageKey])
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  // Sync photo_url to primary photo if this is the first one
  if (nextPosition === 0) {
    await supabase
      .from('vehicles')
      .update({ photo_url: url })
      .eq('id', vehicleId)
      .eq('user_id', profile.org_id)
  }

  return NextResponse.json(photo, { status: 201 })
}
