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
  const entryType = searchParams.get('entry_type') // 'income' | 'expense' | null (all)
  const search = searchParams.get('search')

  let query = supabase
    .from('ledger_transactions')
    .select(`
      *,
      receipt_categories(name, qb_account_name, category_type)
    `)
    .eq('user_id', profile.org_id)
    .order('date', { ascending: false })
    .limit(200)

  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo) query = query.lte('date', dateTo)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (entryType === 'income' || entryType === 'expense') query = query.eq('entry_type', entryType)
  if (search) {
    // Search across vendor (expense) and payer (income)
    query = query.or(`vendor_norm.ilike.%${search}%,payer.ilike.%${search}%,memo.ilike.%${search}%`)
  }

  const { data: transactions } = await query

  // Compute totals for the filtered result set
  const totalIncome = (transactions ?? [])
    .filter(t => t.entry_type === 'income')
    .reduce((sum, t) => sum + (Number(t.amount_total) || 0), 0)

  const totalExpenses = (transactions ?? [])
    .filter(t => t.entry_type !== 'income')
    .reduce((sum, t) => sum + (Number(t.amount_total) || 0), 0)

  return NextResponse.json({
    transactions: transactions ?? [],
    totals: {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
    },
  })
}
