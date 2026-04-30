import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { sendFax } from '@/lib/fax/send'

export const maxDuration = 30

const BUCKET      = 'fax-docs'
const MAX_BYTES   = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'])

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 200)
}

function formatE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : `+${digits}`
}

/**
 * POST /api/fax/send
 * FormData: file (PDF/image), to (phone number), customer_id? (optional)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file        = formData.get('file')
  const toRaw       = formData.get('to')
  const customerId  = formData.get('customer_id')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof toRaw !== 'string' || toRaw.trim() === '') {
    return NextResponse.json({ error: 'to (phone number) is required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}. Use PDF or JPEG.` }, { status: 400 })
  }

  const supabase = await createClient()
  const storage  = createServiceClient()

  // ── Fax page cap check (50 pages/mo default) ─────────────────────────────
  const { data: orgUsage } = await supabase
    .from('organizations')
    .select('monthly_fax_pages, fax_page_cap, subscription_status')
    .eq('id', profile.org_id)
    .maybeSingle()

  const faxPagesUsed = orgUsage?.monthly_fax_pages ?? 0
  const faxPageCap   = orgUsage?.fax_page_cap ?? 50
  if (orgUsage?.subscription_status === 'active' && faxPagesUsed >= faxPageCap) {
    return NextResponse.json({
      error: `Monthly fax page limit reached (${faxPagesUsed}/${faxPageCap} pages). Resets on your next billing cycle.`,
    }, { status: 429 })
  }

  // Resolve From number: org's provisioned number → env fallback
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const fromNumber = orgSettings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER
  if (!fromNumber) {
    return NextResponse.json({ error: 'No Twilio number configured for this org.' }, { status: 503 })
  }

  const toNumber   = formatE164(toRaw)
  const safeName   = sanitizeFilename(file.name)
  const file_key   = `${profile.org_id}/${Date.now()}-${safeName}`
  const arrayBuf   = await file.arrayBuffer()

  // Upload to private fax-docs bucket
  const { error: uploadErr } = await storage.storage
    .from(BUCKET)
    .upload(file_key, new Uint8Array(arrayBuf), { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[fax/send] storage error:', uploadErr.message)
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  // Signed URL valid 1 hour — Twilio fetches the file almost immediately
  const { data: signed } = await storage.storage
    .from(BUCKET)
    .createSignedUrl(file_key, 3600)

  if (!signed?.signedUrl) {
    await storage.storage.from(BUCKET).remove([file_key])
    return NextResponse.json({ error: 'Could not generate file URL' }, { status: 500 })
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'}/api/fax/callback`

  const result = await sendFax(toNumber, fromNumber, signed.signedUrl, callbackUrl)

  if (!result.ok) {
    await storage.storage.from(BUCKET).remove([file_key])
    return NextResponse.json({ error: result.error ?? 'Fax failed' }, { status: 502 })
  }

  // Persist fax record
  const { data: faxRow, error: dbErr } = await supabase
    .from('faxes')
    .insert({
      org_id:      profile.org_id,
      to_number:   toNumber,
      from_number: fromNumber,
      status:      result.status ?? 'queued',
      twilio_sid:  result.sid ?? null,
      file_key,
      file_name:   file.name,
      customer_id: typeof customerId === 'string' && customerId ? customerId : null,
    })
    .select('*')
    .single()

  if (dbErr || !faxRow) {
    console.error('[fax/send] db insert error:', dbErr?.message)
    // Fax is already queued in Twilio — log but don't block
  }

  // Increment fax page counter (1 page per fax; adjust if multi-page support added later)
  void supabase.rpc('increment_fax_pages', { p_org_id: profile.org_id, p_pages: 1 })

  return NextResponse.json({ success: true, fax: faxRow }, { status: 201 })
}
