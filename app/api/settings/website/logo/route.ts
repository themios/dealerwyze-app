/**
 * POST   /api/settings/website/logo — multipart form field `file` (JPEG/PNG/WebP, max 2MB)
 * DELETE /api/settings/website/logo — remove uploaded logo; public site uses default theme logo
 *
 * Enterprise: dealer_admin only; POST uses `assertCanUseFeature(…, 'public_website')` (suspended/canceled blocked;
 * public site is included on free — not a paid-tier gate);
 * magic-byte validation; org_audit_log on success.
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
const MAX_BYTES = 2 * 1024 * 1024

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

async function removeStoredLogo(service: ReturnType<typeof createServiceClient>, orgId: string, publicUrl: string | null) {
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
    .select('id, website_logo_url')
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
    return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const sniffed = sniffImageMime(bytes)
  if (!sniffed) {
    return NextResponse.json({ error: 'File is not a valid JPEG, PNG, or WebP image.' }, { status: 400 })
  }

  const ext = sniffed === 'image/png' ? 'png' : sniffed === 'image/webp' ? 'webp' : 'jpg'
  const storageKey = `${org.id}/website-logo-${crypto.randomUUID()}.${ext}`

  await removeStoredLogo(service, org.id, org.website_logo_url ?? null)

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(storageKey, bytes, { contentType: sniffed, upsert: false })

  if (uploadErr) {
    console.error('[website/logo POST]', uploadErr.message)
    return NextResponse.json({ error: 'Upload failed. Ensure migration 127 (dealer-branding bucket) is applied.' }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    await service.storage.from(BUCKET).remove([storageKey])
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${storageKey}`

  const { error: updateErr } = await supabase
    .from('organizations')
    .update({ website_logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', org.id)

  if (updateErr) {
    await service.storage.from(BUCKET).remove([storageKey])
    return NextResponse.json({ error: 'Could not save logo URL' }, { status: 500 })
  }

  void logOrgAudit({
    org_id: profile.org_id,
    actor_id: profile.id,
    actor_type: 'user',
    action: 'website_logo_uploaded',
    details: { bytes: bytes.byteLength, mime: sniffed },
    ip: requestClientIp(req),
  })

  return NextResponse.json({ website_logo_url: publicUrl })
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
    .select('id, website_logo_url')
    .eq('id', profile.org_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  await removeStoredLogo(service, org.id, org.website_logo_url ?? null)

  const { error } = await supabase
    .from('organizations')
    .update({ website_logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', org.id)

  if (error) {
    return NextResponse.json({ error: 'Could not clear logo' }, { status: 500 })
  }

  void logOrgAudit({
    org_id: profile.org_id,
    actor_id: profile.id,
    actor_type: 'user',
    action: 'website_logo_removed',
    ip: requestClientIp(req),
  })

  return NextResponse.json({ ok: true, website_logo_url: null })
}
