import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { getOrgStorageQuota } from '@/lib/storage/quota'
import { orgTempUploadLimiter } from '@/lib/rateLimit/upstash'

const BUCKET   = 'vehicle-docs'
const MAX_BYTES = 5 * 1024 * 1024

// MMS-safe types (Twilio + common carrier support)
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/pdf',
])

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200)
}

/**
 * Validates the actual file bytes against the declared MIME type using magic bytes.
 * Prevents content-type spoofing (e.g. an HTML file labeled as image/jpeg).
 */
function validateMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  const b = bytes
  switch (mimeType) {
    case 'image/jpeg':
      return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
    case 'image/png':
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
    case 'image/gif':
      return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
    case 'image/webp':
      // RIFF....WEBP
      return (
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
      )
    case 'video/mp4':
      // ftyp box at offset 4
      return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
    case 'application/pdf':
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
    default:
      return false
  }
}

// POST /api/media/upload
// Uploads a local file to temporary org storage and returns a 1-hour signed URL.
// Used by AttachmentPicker (SMS mode) so Twilio can fetch the media bytes.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireProfile()

    // Rate limit: 20 temp uploads per org per hour
    const { allowed } = await orgTempUploadLimiter(profile.org_id)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Try again in an hour.' },
        { status: 429 }
      )
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field is required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: JPEG, PNG, GIF, WebP, MP4, PDF` },
        { status: 400 }
      )
    }

    // Read bytes once; validate size again against actual content
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 })
    }

    // Validate file content matches declared MIME type (magic bytes)
    if (!validateMagicBytes(bytes, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match the declared file type.' },
        { status: 400 }
      )
    }

    // Check org storage quota before uploading
    const supabase = await createClient()
    const { data: usage } = await supabase
      .from('vehicle_documents')
      .select('file_size')
      .eq('user_id', profile.org_id)
    const usedBytes  = (usage ?? []).reduce((sum, d) => sum + (d.file_size ?? 0), 0)
    const quotaBytes = await getOrgStorageQuota(supabase, profile.org_id)
    if (usedBytes + bytes.length > quotaBytes) {
      return NextResponse.json(
        { error: 'Storage limit reached. Delete unused documents or upgrade your plan in Settings.' },
        { status: 413 }
      )
    }

    const storage  = createServiceClient()
    const sanitized = sanitizeFilename(file.name)
    const file_key  = `${profile.org_id}/temp/${Date.now()}-${sanitized}`

    const { error: storageError } = await storage.storage
      .from(BUCKET)
      .upload(file_key, bytes, { contentType: file.type, upsert: false })

    if (storageError) {
      console.error('[media upload] storage error:', storageError.message)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: signed } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(file_key, 3600)

    if (!signed?.signedUrl) {
      await storage.storage.from(BUCKET).remove([file_key])
      return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
    }

    return NextResponse.json({
      signed_url: signed.signedUrl,
      file_name:  sanitized,
      file_size:  bytes.length,
      mime_type:  file.type,
    })
  } catch (err) {
    console.error('[media upload] unhandled error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
