/**
 * POST   /api/settings/website/og-image — Open Graph image (JPEG/PNG/WebP, max 3MB)
 * DELETE — clear custom OG image
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { requestClientIp } from '@/lib/audit/requestIp'
import { sniffImageMime } from '@/lib/uploads/sniffImageMime'

const BUCKET = 'dealer-branding'
const MAX_BYTES = 3 * 1024 * 1024

function objectPathFromPublicUrl(url: string): string | null {
  const needle = `/object/public/${BUCKET}/`
  const i = url.indexOf(needle)
  if (i === -1) return null
  const rest = url.slice(i + needle.length).split('?')[0]
  try {
    return decodeURIComponent(rest)
  } catch {
    return null
  }
}

async function removeStored(service: ReturnType<typeof createServiceClient>, orgId: string, publicUrl: string | null) {
  if (!publicUrl?.trim()) return
  const key = objectPathFromPublicUrl(publicUrl.trim())
  if (!key || !key.startsWith(`${orgId}/`)) return
  await service.storage.from(BUCKET).remove([key])
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    await assertCanUseFeature(profile.org_id, 'public_website')
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    throw err
  }

  const supabase = await createClient()
  const service = createServiceClient()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, website_og_image_url')
    .eq('id', profile.org_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'OG image must be 3 MB or smaller.' }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const sniffed = sniffImageMime(bytes)
  if (!sniffed) {
    return NextResponse.json({ error: 'File is not a valid JPEG, PNG, or WebP image.' }, { status: 400 })
  }

  const ext = sniffed === 'image/png' ? 'png' : sniffed === 'image/webp' ? 'webp' : 'jpg'
  const storageKey = `${org.id}/website-og-${crypto.randomUUID()}.${ext}`

  await removeStored(service, org.id, org.website_og_image_url ?? null)

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(storageKey, bytes, { contentType: sniffed, upsert: false })

  if (uploadErr) {
    console.error('[website/og-image POST]', uploadErr.message)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    await service.storage.from(BUCKET).remove([storageKey])
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${storageKey}`

  const { error: updateErr } = await supabase
    .from('organizations')
    .update({ website_og_image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', org.id)

  if (updateErr) {
    await service.storage.from(BUCKET).remove([storageKey])
    return NextResponse.json({ error: 'Could not save OG image URL' }, { status: 500 })
  }

  void logOrgAudit({
    org_id: profile.org_id,
    actor_id: profile.id,
    actor_type: 'user',
    action: 'website_og_image_uploaded',
    details: { bytes: bytes.byteLength, mime: sniffed },
    ip: requestClientIp(req),
  })

  return NextResponse.json({ website_og_image_url: publicUrl })
}

export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = await createClient()
  const service = createServiceClient()

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, website_og_image_url')
    .eq('id', profile.org_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  await removeStored(service, org.id, org.website_og_image_url ?? null)

  const { error } = await supabase
    .from('organizations')
    .update({ website_og_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', org.id)

  if (error) {
    return NextResponse.json({ error: 'Could not clear OG image' }, { status: 500 })
  }

  void logOrgAudit({
    org_id: profile.org_id,
    actor_id: profile.id,
    actor_type: 'user',
    action: 'website_og_image_removed',
    ip: requestClientIp(req),
  })

  return NextResponse.json({ ok: true, website_og_image_url: null })
}
