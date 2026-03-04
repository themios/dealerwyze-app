import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { checkScanQuota } from '@/lib/leads/scanQuota'
import { scanLeadImage, scanLeadPdf } from '@/lib/leads/visionIngest'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
])

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const orgId   = profile.org_id

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const mime   = file.type
  const isPdf  = mime === 'application/pdf'
  const isImg  = ALLOWED_IMAGE_TYPES.has(mime)

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
  const base64 = Buffer.from(buffer).toString('base64')

  // Run AI extraction
  let scan
  try {
    if (isPdf) {
      scan = await scanLeadPdf(base64)
    } else {
      scan = await scanLeadImage(
        base64,
        mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI extraction failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Duplicate detection — check phone + email against org customers
  const supabase = await createClient()
  let duplicate: { id: string; name: string; phone: string } | null = null

  const phone = scan.phone.value
  const email = scan.email.value

  if (phone || email) {
    const checks: Promise<{ data: { id: string; name: string; primary_phone: string } | null }>[] = []

    if (phone) {
      checks.push(
        supabase
          .from('customers')
          .select('id, name, primary_phone')
          .eq('user_id', orgId)
          .eq('primary_phone', phone)
          .maybeSingle()
          .then(r => r)
      )
    }
    if (email) {
      checks.push(
        supabase
          .from('customers')
          .select('id, name, primary_phone')
          .eq('user_id', orgId)
          .eq('email', email)
          .maybeSingle()
          .then(r => r)
      )
    }

    const results = await Promise.all(checks)
    const found = results.find(r => r.data != null)?.data ?? null
    if (found) {
      duplicate = { id: found.id, name: found.name, phone: found.primary_phone }
    }
  }

  return NextResponse.json({ scan, duplicate, isPdf })
}
