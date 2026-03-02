import { NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  let profile
  try {
    profile = await requireProfile()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  // Service client bypasses RLS — ledger_transactions are stored with user_id = org_id
  // which may differ from auth.uid() in multi-tenant setups.
  const supabase = createServiceClient()

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')

  let query = supabase
    .from('ledger_transactions')
    .select(`*, receipt_categories(name, qb_account_name), vehicles(stock_no, year, make, model)`)
    .eq('user_id', profile.org_id)
    .order('date', { ascending: false })

  // Only apply date filters if both are provided; a single bound is usually a mistake
  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo)   query = query.lte('date', dateTo)

  const { data: rows, error } = await query

  if (error) {
    console.error('[ledger/export] db error:', error.message)
    return new Response('Export failed', { status: 500 })
  }

  function esc(s: string) {
    return `"${String(s).replace(/"/g, '""')}"`
  }

  const lines = [
    'Date,Vendor,Amount,Tax,Category,QB Account,Vehicle,Stock#,Memo,Tags',
    ...(rows ?? []).map(r => {
      const raw  = r.receipt_categories
      const cat  = (Array.isArray(raw)  ? raw[0]  : raw)  as { name: string; qb_account_name: string | null } | null
      const vraw = r.vehicles
      const veh  = (Array.isArray(vraw) ? vraw[0] : vraw) as { stock_no: string; year: number; make: string; model: string } | null
      return [
        (r.date ?? '').slice(0, 10),   // normalise timestamp → YYYY-MM-DD
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
