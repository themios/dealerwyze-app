import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { CustomerDocument } from '@/types'

// Raise Vercel function timeout for file uploads
export const maxDuration = 30

const BUCKET = 'customer-docs'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const CAP_BYTES = 500 * 1024 * 1024 // 500 MB combined org cap
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

// GET /api/customers/[id]/documents
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: customerId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const storage = createServiceClient()

  const { data: docs, error } = await supabase
    .from('customer_documents')
    .select('*')
    .eq('customer_id', customerId)
    .eq('user_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[documents GET] db error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }

  // Generate signed URLs via service client (bypasses storage RLS)
  const withUrls = await Promise.all(
    (docs ?? []).map(async (doc: CustomerDocument) => {
      const { data: signed } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_key, 3600)
      return { ...doc, signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json(withUrls)
}

// POST /api/customers/[id]/documents
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: customerId } = await params
    const profile = await requireProfile()
    const supabase = await createClient()
    const storage = createServiceClient()

    // Parse multipart form data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file')
    const label = formData.get('label')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field is required' }, { status: 400 })
    }
    if (typeof label !== 'string' || label.trim() === '') {
      return NextResponse.json({ error: 'label field is required' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File exceeds 5 MB limit` }, { status: 400 })
    }

    // Check combined org storage cap (vehicle_documents + customer_documents)
    const [{ data: vUsage }, { data: cUsage }] = await Promise.all([
      supabase.from('vehicle_documents').select('file_size').eq('user_id', profile.org_id),
      supabase.from('customer_documents').select('file_size').eq('user_id', profile.org_id),
    ])
    const usedBytes = [...(vUsage ?? []), ...(cUsage ?? [])].reduce((s, d) => s + (d.file_size ?? 0), 0)
    if (usedBytes + file.size > CAP_BYTES) {
      return NextResponse.json({ error: 'Storage limit reached (500 MB). Delete unused documents to free up space.' }, { status: 413 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
    }

    const sanitized = sanitizeFilename(file.name)
    const file_key = `${profile.org_id}/${customerId}/${Date.now()}-${sanitized}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload via service client (bypasses storage RLS)
    const { error: storageError } = await storage.storage
      .from(BUCKET)
      .upload(file_key, buffer, { contentType: file.type, upsert: false })

    if (storageError) {
      console.error('[documents POST] storage error:', storageError.message)
      return NextResponse.json({ error: 'Storage upload failed', detail: storageError.message }, { status: 500 })
    }

    // Insert DB record via user client (respects RLS)
    const { data: doc, error: dbError } = await supabase
      .from('customer_documents')
      .insert({
        user_id: profile.org_id,
        customer_id: customerId,
        label: label.trim(),
        file_name: file.name,
        file_key,
        file_size: file.size,
        mime_type: file.type,
      })
      .select('*')
      .single()

    if (dbError || !doc) {
      // Rollback storage upload
      await storage.storage.from(BUCKET).remove([file_key])
      console.error('[documents POST] db error:', dbError?.message)
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
    }

    const { data: signed } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(file_key, 3600)

    return NextResponse.json(
      { ...doc, signed_url: signed?.signedUrl ?? null },
      { status: 201 }
    )
  } catch (err) {
    console.error('[documents POST] unhandled error:', err)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
