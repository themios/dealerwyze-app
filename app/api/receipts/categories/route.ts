import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('*')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  return NextResponse.json({ categories: categories ?? [] })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    name: string
    requires_vehicle?: boolean
    qb_account_name?: string
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: category, error } = await supabase
    .from('receipt_categories')
    .insert({
      user_id: profile.org_id,
      name: body.name.trim(),
      requires_vehicle: body.requires_vehicle ?? false,
      qb_account_name: body.qb_account_name ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ category }, { status: 201 })
}
