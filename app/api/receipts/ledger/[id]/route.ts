import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'
import type { UserRole } from '@/types/index'
import { logger } from '@/lib/logger'

// Admin-only: patch vehicle, category, memo on any org transaction
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = await createClient()

  const body = await req.json() as {
    vehicle_id?: string | null
    category_id?: string
    memo?: string | null
    amount_total?: number | null
    vendor_norm?: string | null
    date?: string | null
  }

  // Whitelist only editable fields
  const patch: Record<string, unknown> = {}
  if ('vehicle_id' in body) patch.vehicle_id = body.vehicle_id
  if ('category_id' in body) patch.category_id = body.category_id
  if ('memo' in body) patch.memo = body.memo
  if ('amount_total' in body && body.amount_total != null) patch.amount_total = Number(body.amount_total)
  if ('vendor_norm' in body) patch.vendor_norm = body.vendor_norm
  if ('date' in body && body.date) patch.date = body.date

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: transaction, error } = await supabase
    .from('ledger_transactions')
    .update(patch)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select(`*, receipt_categories(name), vehicles(stock_no, year, make, model)`)
    .single()

  if (error) {
    logger.error('receipts/ledger', error, { op: 'patch' }, profile.org_id)
    return NextResponse.json({ error: 'Database error' }, { status: 400 })
  }
  return NextResponse.json({ transaction })
}

// Admin-only: delete a ledger transaction
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('ledger_transactions')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    logger.error('receipts/ledger', error, { op: 'delete' }, profile.org_id)
    return NextResponse.json({ error: 'Database error' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
