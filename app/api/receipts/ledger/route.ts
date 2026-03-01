import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const categoryId = searchParams.get('category_id')
  const search = searchParams.get('search')

  let query = supabase
    .from('ledger_transactions')
    .select(`
      *,
      receipt_categories(name, qb_account_name)
    `)
    .eq('user_id', profile.org_id)
    .order('date', { ascending: false })
    .limit(200)

  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo) query = query.lte('date', dateTo)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (search) query = query.ilike('vendor_norm', `%${search}%`)

  const { data: transactions } = await query

  return NextResponse.json({ transactions: transactions ?? [] })
}
