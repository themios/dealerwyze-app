export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import LedgerClient from '@/components/receipts/LedgerClient'

export default async function LedgerPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: transactions }, { data: categories }, { data: lotVehicles }, { data: soldVehicles }] =
    await Promise.all([
      supabase
        .from('ledger_transactions')
        .select(`
          id, date, vendor_norm, amount_total, tax, memo, tags, vehicle_id, created_at,
          receipt_categories(name),
          vehicles(stock_no, year, make, model)
        `)
        .eq('user_id', profile.org_id)
        .eq('status', 'posted')
        .order('date', { ascending: false })
        .limit(200),
      supabase
        .from('receipt_categories')
        .select('id, name')
        .eq('user_id', profile.org_id)
        .order('sort_order'),
      supabase
        .from('vehicles')
        .select('id, stock_no, year, make, model, status')
        .eq('user_id', profile.org_id)
        .in('status', ['available', 'pending'])
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('vehicles')
        .select('id, stock_no, year, make, model, status, sold_at')
        .eq('user_id', profile.org_id)
        .eq('status', 'sold')
        .gte('sold_at', ninetyDaysAgo)
        .order('sold_at', { ascending: false })
        .limit(40),
    ])

  return (
    <div className="pb-4">
      <TopBar title="Ledger" />
      <LedgerClient
        transactions={transactions ?? []}
        categories={categories ?? []}
        lotVehicles={lotVehicles ?? []}
        soldVehicles={soldVehicles ?? []}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
