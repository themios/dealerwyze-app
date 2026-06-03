import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { classifyReceipt } from '@/lib/receipts/vision'
import { extractIncomeDocument } from '@/lib/receipts/incomeVision'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { orgReceiptScanLimiter } from '@/lib/rateLimit/upstash'

export const maxDuration = 60

// Storage: service role required — Supabase Storage ignores session-level RLS

export async function POST(req: NextRequest) {
  try {
  const profile = await requireProfile()

  await assertCanUseFeature(profile.org_id, 'ai_receipt')
  const { allowed } = await orgReceiptScanLimiter(profile.org_id)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Receipt scan limit reached (25 per day). Try again tomorrow.' },
      { status: 429 },
    )
  }

  const supabase = await createClient()
  const service = createServiceClient()

  const body = await req.json() as {
    image_base64: string
    mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
    filename?: string
    entry_type?: 'expense' | 'income'
  }
  const entryType = body.entry_type === 'income' ? 'income' : 'expense'

  if (!body.image_base64 || !body.mime_type) {
    return NextResponse.json({ error: 'image_base64 and mime_type are required' }, { status: 400 })
  }
  // ~4MB base64 string ≈ 3MB decoded image — prevent memory exhaustion
  const MAX_BASE64_LEN = 4 * 1024 * 1024
  if (body.image_base64.length > MAX_BASE64_LEN) {
    return NextResponse.json({ error: 'Image too large (max 3 MB)' }, { status: 413 })
  }

  // Create receipt record (status=processing)
  const { data: receipt, error: createErr } = await supabase
    .from('receipts')
    .insert({ user_id: profile.org_id, status: 'processing', entry_type: entryType })
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

  // Run AI extraction — different extractor for income vs expense
  let updated
  if (entryType === 'income') {
    let income
    try {
      income = await extractIncomeDocument(body.image_base64, body.mime_type)
    } catch (err) {
      await supabase
        .from('receipts')
        .update({ status: 'failed', storage_path: storagePath, error_message: String(err) })
        .eq('id', receipt.id)
      return NextResponse.json({ error: 'AI extraction failed', detail: String(err) }, { status: 500 })
    }

    const { data: u } = await supabase
      .from('receipts')
      .update({
        status: 'draft_ready',
        storage_path: storagePath,
        entry_type: 'income',
        payer: income.payer,
        receipt_date: income.date,
        total: income.amount,
        check_number: income.check_number,
        payment_method: income.payment_method,
        reference_number: income.reference_number,
        payment_hint: income.bank_name,
        ai_json: income,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receipt.id)
      .select()
      .single()
    updated = u
  } else {
    // Expense path — existing logic
    const { data: categories } = await supabase
      .from('receipt_categories')
      .select('id, name, requires_vehicle')
      .eq('user_id', profile.org_id)
      .eq('category_type', 'expense')
      .order('sort_order')

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

    const { data: u } = await supabase
      .from('receipts')
      .update({
        status: 'draft_ready',
        storage_path: storagePath,
        entry_type: 'expense',
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
    updated = u
  }

  return NextResponse.json({ receipt: updated })
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    throw err
  }
}
