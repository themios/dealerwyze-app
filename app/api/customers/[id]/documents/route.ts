import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { getOrgStorageQuota, checkFreeTierAttachmentLimit } from '@/lib/storage/quota'
import { CustomerDocument } from '@/types'

// Raise Vercel function timeout for file uploads
export const maxDuration = 30

const BUCKET = 'customer-docs'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
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
      // ✓ Security: Verify storage path includes org_id prefix before generating signed URL
      // This prevents access to files outside org's storage namespace, even if file_key was tampered with
      const expectedPrefix = `${profile.org_id}/`
      if (!doc.file_key.startsWith(expectedPrefix)) {
        console.warn(
          '[documents GET] Rejected storage access: file_key does not belong to org',
          { fileKey: doc.file_key, orgId: profile.org_id }
        )
        return { ...doc, signed_url: null }
      }

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

    // Verify customer belongs to this org
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('user_id', profile.org_id)
      .maybeSingle()
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Free tier: only 2 customers may have attachments
    const attachmentError = await checkFreeTierAttachmentLimit(supabase, profile.org_id, 'customer', customerId)
    if (attachmentError) return NextResponse.json({ error: attachmentError }, { status: 403 })

    // Check combined org storage cap (vehicle_documents + customer_documents)
    const [{ data: vUsage }, { data: cUsage }] = await Promise.all([
      supabase.from('vehicle_documents').select('file_size').eq('user_id', profile.org_id),
      supabase.from('customer_documents').select('file_size').eq('user_id', profile.org_id),
    ])
    const usedBytes = [...(vUsage ?? []), ...(cUsage ?? [])].reduce((s, d) => s + (d.file_size ?? 0), 0)
    const quotaBytes = await getOrgStorageQuota(supabase, profile.org_id)
    if (usedBytes + file.size > quotaBytes) {
      return NextResponse.json(
        { error: "You've used all your free storage (50 MB). Upgrade to a paid plan to upload more files." },
        { status: 413 },
      )
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
