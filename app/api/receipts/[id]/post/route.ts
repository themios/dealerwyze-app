import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    category_id: string
    memo?: string
    vehicle_id?: string | null
    tags?: string[]
    save_vendor_rule?: boolean
  }

  if (!body.category_id) {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  if (receipt.status === 'posted') {
    return NextResponse.json({ error: 'Already posted' }, { status: 400 })
  }

  const txDate = receipt.receipt_date ?? new Date().toISOString().slice(0, 10)

  const { data: transaction, error: txErr } = await supabase
    .from('ledger_transactions')
    .insert({
      user_id: profile.org_id,
      receipt_id: id,
      date: txDate,
      vendor_norm: receipt.vendor_norm ?? receipt.vendor_raw,
      amount_total: receipt.total,
      tax: receipt.tax,
      category_id: body.category_id,
      memo: body.memo ?? null,
      vehicle_id: body.vehicle_id ?? null,
      tags: body.tags ?? [],
      status: 'posted',
    })
    .select()
    .single()

  if (txErr || !transaction) {
    return NextResponse.json(
      { error: 'Failed to create transaction', detail: txErr?.message },
      { status: 500 }
    )
  }

  // Mark receipt as posted
  await supabase.from('receipts').update({ status: 'posted' }).eq('id', id)

  // Optionally save vendor rule for future auto-classification
  if (body.save_vendor_rule && receipt.vendor_norm) {
    await supabase.from('vendor_rules').upsert(
      {
        user_id: profile.org_id,
        vendor_norm: receipt.vendor_norm,
        category_id: body.category_id,
        tags: body.tags ?? [],
      },
      { onConflict: 'user_id,vendor_norm' }
    )
  }

  return NextResponse.json({ transaction })
}
