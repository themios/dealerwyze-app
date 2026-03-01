import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

// Admin-only: patch vehicle, category, memo on any org transaction
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()

  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = await createClient()

  const body = await req.json() as {
    vehicle_id?: string | null
    category_id?: string
    memo?: string | null
  }

  // Whitelist only editable fields
  const patch: Record<string, unknown> = {}
  if ('vehicle_id' in body) patch.vehicle_id = body.vehicle_id
  if ('category_id' in body) patch.category_id = body.category_id
  if ('memo' in body) patch.memo = body.memo

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: transaction, error } = await supabase
    .from('ledger_transactions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select(`*, receipt_categories(name), vehicles(stock_no, year, make, model)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ transaction })
}
