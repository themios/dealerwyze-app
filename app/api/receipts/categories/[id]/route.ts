import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json()

  const { data: category, error } = await supabase
    .from('receipt_categories')
    .update(body)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select()
    .single()

  if (error) {
    console.error('[receipts/categories PATCH]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 400 })
  }
  return NextResponse.json({ category })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('receipt_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    console.error('[receipts/categories DELETE]', error)
    return NextResponse.json({ error: 'Database error' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
