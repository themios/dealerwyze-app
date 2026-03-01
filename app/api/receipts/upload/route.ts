import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { classifyReceipt } from '@/lib/receipts/vision'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const service = createServiceClient()

  const body = await req.json() as {
    image_base64: string
    mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
    filename?: string
  }

  if (!body.image_base64 || !body.mime_type) {
    return NextResponse.json({ error: 'image_base64 and mime_type are required' }, { status: 400 })
  }

  // Create receipt record (status=processing)
  const { data: receipt, error: createErr } = await supabase
    .from('receipts')
    .insert({ user_id: profile.org_id, status: 'processing' })
    .select()
    .single()

  if (createErr || !receipt) {
    return NextResponse.json({ error: 'Failed to create receipt record' }, { status: 500 })
  }

  const ext = body.mime_type === 'image/png' ? 'png' : body.mime_type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `${profile.org_id}/${receipt.id}.${ext}`

  // Upload to Supabase storage
  const imageBuffer = Buffer.from(body.image_base64, 'base64')
  const { error: uploadErr } = await service.storage
    .from('receipts')
    .upload(storagePath, imageBuffer, { contentType: body.mime_type, upsert: true })

  if (uploadErr) {
    await supabase
      .from('receipts')
      .update({ status: 'failed', error_message: uploadErr.message })
      .eq('id', receipt.id)
    return NextResponse.json({ error: 'Storage upload failed', detail: uploadErr.message }, { status: 500 })
  }

  // Fetch categories for AI context
  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('id, name, requires_vehicle')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  // Run AI classification (OCR + classify in one call)
  let extraction
  try {
    extraction = await classifyReceipt(body.image_base64, body.mime_type, categories ?? [])
  } catch (err) {
    await supabase
      .from('receipts')
      .update({ status: 'failed', storage_path: storagePath, error_message: String(err) })
      .eq('id', receipt.id)
    return NextResponse.json({ error: 'AI classification failed', detail: String(err) }, { status: 500 })
  }

  // Update receipt with extracted data
  const { data: updated } = await supabase
    .from('receipts')
    .update({
      status: 'draft_ready',
      storage_path: storagePath,
      vendor_raw: extraction.vendor_raw,
      vendor_norm: extraction.vendor_norm,
      receipt_date: extraction.receipt_date,
      location_raw: extraction.location_raw,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      total: extraction.total,
      currency: extraction.currency ?? 'USD',
      payment_hint: extraction.payment_hint,
      ai_json: extraction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receipt.id)
    .select()
    .single()

  return NextResponse.json({ receipt: updated })
}
