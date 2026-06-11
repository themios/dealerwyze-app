import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { checkScanQuota } from '@/lib/leads/scanQuota'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
])

function normalizeImageMime(mime: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'image/jpeg') return 'image/jpeg'
  if (mime === 'image/png') return 'image/png'
  if (mime === 'image/webp') return 'image/webp'
  if (mime === 'image/gif') return 'image/gif'
  return null
}

function sniffImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  // GIF: 47 49 46 38
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return null
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const orgId   = profile.org_id

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const declaredMime = file.type
  const normalizedDeclared = normalizeImageMime(declaredMime)
  const isPdf  = declaredMime === 'application/pdf'
  const isImg  = ALLOWED_IMAGE_TYPES.has(declaredMime)

  if (!isPdf && !isImg) {
    return NextResponse.json(
      { error: 'Unsupported file type. Send an image (JPEG/PNG/WebP) or PDF.' },
      { status: 415 }
    )
  }

  // File size guard (10 MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  // Quota check before running AI
  const quota = await checkScanQuota(orgId, isPdf)
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: 'Scan quota reached',
        reason: quota.reason,
        monthly_used: quota.monthly_used,
        monthly_limit: quota.monthly_limit,
        plan: quota.plan,
      },
      { status: 429 }
    )
  }

  // Convert file to base64
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const base64 = Buffer.from(buffer).toString('base64')

  // Run AI extraction — dynamic import so Anthropic SDK is never bundled in client
  let scan
  try {
    const { scanLeadImage, scanLeadPdf } = await import('@/lib/leads/visionIngest')
    if (isPdf) {
      scan = await scanLeadPdf(base64)
    } else {
      // Some clients report a MIME type derived from the filename extension; ensure it matches the actual bytes.
      const sniffed = sniffImageMime(bytes)
      const mime = sniffed ?? normalizedDeclared
      if (!mime) {
        return NextResponse.json(
          { error: 'Unsupported image type. Please upload JPEG, PNG, WebP, or GIF.' },
          { status: 415 }
        )
      }
      scan = await scanLeadImage(
        base64,
        mime,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI extraction failed'
    console.error('[leads/scan] AI error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Filter out empty results (AI returning all-null leads)
  const validLeads = scan.filter(s =>
    s.phone?.value || s.email?.value || s.first_name?.value
  )
  if (validLeads.length === 0) {
    return NextResponse.json(
      { error: 'No leads found in this document.' },
      { status: 422 }
    )
  }

  // Duplicate detection — per lead, check phone + email against org customers
  const supabase = await createClient()
  type CustomerRow = { id: string; name: string; primary_phone: string } | null

  async function detectDuplicate(phone: string | null, email: string | null) {
    if (!phone && !email) return null
    const checks: Promise<{ data: CustomerRow }>[] = []
    if (phone) {
      checks.push(
        Promise.resolve(
          supabase
            .from('customers')
            .select('id, name, primary_phone')
            .eq('user_id', orgId)
            .eq('primary_phone', phone)
            .maybeSingle()
            .then(r => ({ data: r.data as CustomerRow }))
        )
      )
    }
    if (email) {
      checks.push(
        Promise.resolve(
          supabase
            .from('customers')
            .select('id, name, primary_phone')
            .eq('user_id', orgId)
            .eq('email', email)
            .maybeSingle()
            .then(r => ({ data: r.data as CustomerRow }))
        )
      )
    }
    const results = await Promise.all(checks)
    const found = results.find(r => r.data != null)?.data ?? null
    return found ? { id: found.id, name: found.name, phone: found.primary_phone } : null
  }

  const leads = await Promise.all(
    validLeads.map(async s => ({
      scan: s,
      duplicate: await detectDuplicate(s.phone?.value ?? null, s.email?.value ?? null),
    }))
  )

  return NextResponse.json({ leads, isPdf })
}
