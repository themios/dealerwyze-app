import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { getOrgStorageQuota } from '@/lib/storage/quota'
import { summarizeVehicleDoc } from '@/lib/voice/summarizeVehicleDoc'
import { VehicleDocument } from '@/types'

export const maxDuration = 60 // allow time for AI summarization

const BUCKET = 'vehicle-docs'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB (images compressed client-side to ~800 KB; PDFs rarely exceed 3 MB)
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200)
}

// GET /api/vehicles/[id]/documents
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: vehicleId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const storage = createServiceClient()

  const { data: docs, error } = await supabase
    .from('vehicle_documents')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('user_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[vehicle documents GET] db error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }

  const withUrls = await Promise.all(
    (docs ?? []).map(async (doc: VehicleDocument) => {
      const { data: signed } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_key, 3600)
      return { ...doc, signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json(withUrls)
}

// POST /api/vehicles/[id]/documents
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: vehicleId } = await params
    const profile = await requireProfile()
    const supabase = await createClient()
    const storage = createServiceClient()

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file  = formData.get('file')
    const label = formData.get('label')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field is required' }, { status: 400 })
    }
    if (typeof label !== 'string' || label.trim() === '') {
      return NextResponse.json({ error: 'label field is required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
    }

    // Block uploads to sold vehicles
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('status')
      .eq('id', vehicleId)
      .eq('user_id', profile.org_id)
      .maybeSingle()

    if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (vehicle.status === 'sold') {
      return NextResponse.json({ error: 'Uploads are disabled for sold vehicles' }, { status: 403 })
    }

    // Enforce 500 MB per-org storage cap
    const { data: usage } = await supabase
      .from('vehicle_documents')
      .select('file_size')
      .eq('user_id', profile.org_id)
    const usedBytes = (usage ?? []).reduce((sum, d) => sum + (d.file_size ?? 0), 0)
    const quotaBytes = await getOrgStorageQuota(supabase, profile.org_id)
    if (usedBytes + file.size > quotaBytes) {
      return NextResponse.json(
        { error: 'Storage limit reached. Delete unused documents or upgrade your storage plan in Settings.' },
        { status: 413 }
      )
    }

    const sanitized  = sanitizeFilename(file.name)
    const file_key   = `${profile.org_id}/${vehicleId}/${Date.now()}-${sanitized}`
    const safe_name  = sanitized // store the sanitized name — never the raw file.name

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: storageError } = await storage.storage
      .from(BUCKET)
      .upload(file_key, buffer, { contentType: file.type, upsert: false })

    if (storageError) {
      console.error('[vehicle documents POST] storage error:', storageError.message)
      return NextResponse.json({ error: 'Storage upload failed', detail: storageError.message }, { status: 500 })
    }

    // AI summarize (best-effort — null is fine)
    const ai_summary = await summarizeVehicleDoc(file_key, BUCKET, file.type)

    const { data: doc, error: dbError } = await supabase
      .from('vehicle_documents')
      .insert({
        user_id:    profile.org_id,
        vehicle_id: vehicleId,
        label:      label.trim(),
        file_name:  safe_name,
        file_key,
        file_size:  file.size,
        mime_type:  file.type,
        ai_summary,
      })
      .select('*')
      .single()

    if (dbError || !doc) {
      const { error: removeErr } = await storage.storage.from(BUCKET).remove([file_key])
      if (removeErr) console.error('[vehicle documents POST] orphaned file — storage remove failed:', removeErr.message, 'key:', file_key)
      console.error('[vehicle documents POST] db error:', dbError?.message)
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
    }

    // Recompute voice_summary = concat of all doc ai_summaries for this vehicle
    const { data: allDocs } = await supabase
      .from('vehicle_documents')
      .select('label, ai_summary')
      .eq('vehicle_id', vehicleId)
      .eq('user_id', profile.org_id)
      .not('ai_summary', 'is', null)

    if (allDocs && allDocs.length > 0) {
      const voice_summary = allDocs
        .map(d => `[${d.label}]\n${d.ai_summary}`)
        .join('\n\n')

      await supabase
        .from('vehicles')
        .update({ voice_summary })
        .eq('id', vehicleId)
        .eq('user_id', profile.org_id)
    }

    const { data: signed } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(file_key, 3600)

    return NextResponse.json(
      { ...doc, signed_url: signed?.signedUrl ?? null },
      { status: 201 }
    )
  } catch (err) {
    console.error('[vehicle documents POST] unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
