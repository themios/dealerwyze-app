import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

// Returns any posted ledger transactions that look like duplicates:
// same vendor_norm (case-insensitive) AND same amount_total within ±7 days of the given date.
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const { searchParams } = new URL(req.url)

  const vendor = searchParams.get('vendor')?.trim() ?? ''
  const amount = parseFloat(searchParams.get('amount') ?? '')
  const date = searchParams.get('date') ?? ''

  if (!vendor || isNaN(amount) || !date) {
    return NextResponse.json({ duplicates: [] })
  }

  const d = new Date(date + 'T12:00:00')
  if (isNaN(d.getTime())) return NextResponse.json({ duplicates: [] })

  const from = new Date(d); from.setDate(from.getDate() - 7)
  const to   = new Date(d); to.setDate(to.getDate() + 7)

  const supabase = await createClient()

  const { data } = await supabase
    .from('ledger_transactions')
    .select('id, date, vendor_norm, amount_total, memo, category_id')
    .eq('user_id', profile.org_id)
    .eq('status', 'posted')
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', to.toISOString().slice(0, 10))
    .eq('amount_total', amount)
    .ilike('vendor_norm', vendor)
    .limit(5)

  return NextResponse.json({ duplicates: data ?? [] })
}
