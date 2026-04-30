import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canAccessLedger } from '@/lib/auth/dealerRoles'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  // Verify ownership before patching
  const { data: existing } = await supabase
    .from('receipts')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if ('vendor_norm' in body) patch.vendor_norm = body.vendor_norm ? String(body.vendor_norm).trim().slice(0, 200) : null
  if ('receipt_date' in body) patch.receipt_date = body.receipt_date ? String(body.receipt_date) : null
  if ('total' in body) {
    const n = parseFloat(body.total)
    patch.total = isNaN(n) ? null : Math.round(n * 100) / 100
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('receipts').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Generate signed URL (1 hour)
  let signed_url: string | null = null
  if (receipt.storage_path) {
    const { data } = await service.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 3600)
    signed_url = data?.signedUrl ?? null
  }

  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('id, name, requires_vehicle, sort_order')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  return NextResponse.json({
    receipt: { ...receipt, signed_url },
    categories: categories ?? [],
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const supabase = await createClient()
  const storage = createServiceClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('receipts')
    .select('id, storage_path')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete linked ledger_transactions first
  await supabase.from('ledger_transactions').delete().eq('receipt_id', id)

  // Delete the receipt row
  const { error } = await supabase.from('receipts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

  // Best-effort storage cleanup (service role — storage bucket RLS)
  if (existing.storage_path) {
    await storage.storage.from('receipts').remove([existing.storage_path])
  }

  return NextResponse.json({ ok: true })
}
