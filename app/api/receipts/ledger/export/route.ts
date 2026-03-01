import { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let query = supabase
    .from('ledger_transactions')
    .select(`*, receipt_categories(name, qb_account_name), vehicles(stock_no, year, make, model)`)
    .eq('user_id', profile.org_id)
    .eq('status', 'posted')
    .order('date', { ascending: false })

  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo) query = query.lte('date', dateTo)

  const { data: rows } = await query

  function esc(s: string) {
    return `"${s.replace(/"/g, '""')}"`
  }

  const lines = [
    'Date,Vendor,Amount,Tax,Category,QB Account,Vehicle,Stock#,Memo,Tags',
    ...(rows ?? []).map(r => {
      const raw = r.receipt_categories
      const cat = (Array.isArray(raw) ? raw[0] : raw) as { name: string; qb_account_name: string | null } | null
      const vraw = r.vehicles
      const veh = (Array.isArray(vraw) ? vraw[0] : vraw) as { stock_no: string; year: number; make: string; model: string } | null
      return [
        r.date ?? '',
        esc(r.vendor_norm ?? ''),
        r.amount_total ?? '',
        r.tax ?? '',
        esc(cat?.name ?? ''),
        esc(cat?.qb_account_name ?? ''),
        esc(veh ? `${veh.year} ${veh.make} ${veh.model}` : ''),
        esc(veh?.stock_no ?? ''),
        esc(r.memo ?? ''),
        esc((r.tags ?? []).join('; ')),
      ].join(',')
    }),
  ]

  const today = new Date().toISOString().slice(0, 10)
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="ledger-${today}.csv"`,
    },
  })
}
