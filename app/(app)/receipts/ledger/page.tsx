export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import BackButton from '@/components/layout/BackButton'
import LedgerClient from '@/components/receipts/LedgerClient'
import Link from 'next/link'
import { Camera, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function LedgerPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const renderNow = new Date()
  const ninetyDaysAgo = new Date(renderNow.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: transactions }, { data: categories }, { data: lotVehicles }, { data: soldVehicles }] =
    await Promise.all([
      supabase
        .from('ledger_transactions')
        .select('id, date, entry_type, vendor_norm, payer, amount_total, tax, memo, tags, vehicle_id, category_id, receipt_id, created_at')
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
        .in('status', ['staging', 'available', 'pending'])
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

  const allVehicles = [...(lotVehicles ?? []), ...(soldVehicles ?? [])]

  return (
    <div className="pb-4">
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <BackButton href="/receipts" />
            <h1 className="text-lg font-semibold">Ledger</h1>
          </div>
        }
        right={
          <div className="flex items-center gap-1">
            <Link href="/receipts/pl">
              <Button size="sm" variant="ghost" className="text-xs gap-1">
                <BarChart3 className="h-4 w-4" />
                P&amp;L
              </Button>
            </Link>
            <Link href="/receipts">
              <Button size="sm" variant="ghost" className="text-xs gap-1">
                <Camera className="h-4 w-4" />
                Scan
              </Button>
            </Link>
          </div>
        }
      />
      <LedgerClient
        transactions={transactions ?? []}
        categories={categories ?? []}
        lotVehicles={lotVehicles ?? []}
        soldVehicles={soldVehicles ?? []}
        allVehicles={allVehicles}
        isAdmin={profile.role === 'admin' || profile.role === 'dealer_admin'}
      />
    </div>
  )
}
