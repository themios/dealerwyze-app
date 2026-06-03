export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import TopBar from '@/components/layout/TopBar'
import BackButton from '@/components/layout/BackButton'
import ReconcileClient from './ReconcileClient'

export default async function ReconcilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: statement } = await supabase
    .from('bank_statements')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!statement) notFound()

  const { data: lines } = await supabase
    .from('bank_statement_lines')
    .select(`
      *,
      ledger_transactions (
        id, date, amount_total, entry_type, vendor_norm, payer, memo,
        receipt_categories (name)
      )
    `)
    .eq('statement_id', id)
    .order('line_date', { ascending: true })

  // Ledger entries in the statement period that are not bank-cleared
  let ledgerOnlyQuery = supabase
    .from('ledger_transactions')
    .select('id, date, amount_total, entry_type, vendor_norm, payer, memo, receipt_categories(name)')
    .eq('user_id', profile.org_id)
    .eq('status', 'posted')
    .eq('bank_cleared', false)

  if (statement.statement_start) ledgerOnlyQuery = ledgerOnlyQuery.gte('date', statement.statement_start)
  if (statement.statement_end)   ledgerOnlyQuery = ledgerOnlyQuery.lte('date', statement.statement_end)

  const [{ data: ledgerOnly }, { data: categories }] = await Promise.all([
    ledgerOnlyQuery.limit(200),
    supabase
      .from('receipt_categories')
      .select('id, name, category_type, requires_vehicle')
      .eq('user_id', profile.org_id)
      .order('sort_order'),
  ])

  const allLines = lines ?? []
  const matched   = allLines.filter(l => l.match_status === 'matched')
  const bankOnly  = allLines.filter(l => l.match_status === 'pending')
  const cleared   = allLines.filter(l => l.match_status === 'cleared')
  const ignored   = allLines.filter(l => l.match_status === 'ignored')

  const summary = {
    total_lines: allLines.length,
    matched:     matched.length,
    pending:     bankOnly.length,
    cleared:     cleared.length,
    ignored:     ignored.length,
    ledger_only: (ledgerOnly ?? []).length,
  }

  return (
    <div className="pb-4">
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <BackButton href="/receipts" />
            <h1 className="text-lg font-semibold">Reconcile Statement</h1>
          </div>
        }
      />
      <ReconcileClient
        statement={statement}
        matched={matched}
        bankOnly={bankOnly}
        cleared={cleared}
        ignored={ignored}
        ledgerOnly={ledgerOnly ?? []}
        summary={summary}
        categories={categories ?? []}
      />
    </div>
  )
}
