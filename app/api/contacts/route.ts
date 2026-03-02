import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 30

const BUCKET       = 'contact-cards'
const MAX_BYTES    = 10 * 1024 * 1024
const IMAGE_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp'])

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 200)
}

/** GET /api/contacts — list all contacts, with signed card image URLs */
export async function GET(): Promise<NextResponse> {
  let profile
  try { profile = await requireProfile() }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const supabase = await createClient()
  const service  = createServiceClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach signed URLs for contacts that have a stored card image
  const withUrls = await Promise.all(
    (data ?? []).map(async (c) => {
      if (!c.card_image_key) return { ...c, card_signed_url: null }
      const { data: signed } = await service.storage
        .from(BUCKET)
        .createSignedUrl(c.card_image_key, 3600)
      return { ...c, card_signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json(withUrls)
}

/**
 * POST /api/contacts — create a contact.
 * Accepts multipart/form-data with optional card_image file.
 * Fields: name, company, title, phone, email, fax, address, website, notes, card_image?
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try { profile = await requireProfile() }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const name    = (formData.get('name')    as string | null)?.trim()
  const company = (formData.get('company') as string | null)?.trim() || null
  const title   = (formData.get('title')   as string | null)?.trim() || null
  const phone   = (formData.get('phone')   as string | null)?.trim() || null
  const email   = (formData.get('email')   as string | null)?.trim() || null
  const fax     = (formData.get('fax')     as string | null)?.trim() || null
  const address = (formData.get('address') as string | null)?.trim() || null
  const website = (formData.get('website') as string | null)?.trim() || null
  const notes   = (formData.get('notes')   as string | null)?.trim() || null
  const imgFile = formData.get('card_image')

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = await createClient()
  const service  = createServiceClient()

  // Optional: upload card image
  let card_image_key: string | null = null
  if (imgFile instanceof File && imgFile.size > 0) {
    if (!IMAGE_TYPES.has(imgFile.type)) {
      return NextResponse.json({ error: 'Card image must be JPEG, PNG, or WebP' }, { status: 400 })
    }
    if (imgFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Card image exceeds 10 MB' }, { status: 400 })
    }
    const safeName = sanitizeFilename(imgFile.name || 'card.jpg')
    card_image_key = `${profile.org_id}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await service.storage
      .from(BUCKET)
      .upload(card_image_key, new Uint8Array(await imgFile.arrayBuffer()), {
        contentType: imgFile.type,
        upsert: false,
      })
    if (uploadErr) {
      console.error('[contacts POST] image upload error:', uploadErr.message)
      card_image_key = null // non-fatal: save contact without image
    }
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({ name, company, title, phone, email, fax, address, website, notes, card_image_key, org_id: profile.org_id })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate signed URL for response
  let card_signed_url: string | null = null
  if (data.card_image_key) {
    const { data: signed } = await service.storage
      .from(BUCKET)
      .createSignedUrl(data.card_image_key, 3600)
    card_signed_url = signed?.signedUrl ?? null
  }

  return NextResponse.json({ ...data, card_signed_url }, { status: 201 })
}
