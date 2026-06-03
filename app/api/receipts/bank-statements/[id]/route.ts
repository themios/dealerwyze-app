/**
 * GET /api/receipts/bank-statements/[id]
 *
 * Returns the statement with all lines organized into three reconciliation buckets:
 *   matched   — bank line matched to a ledger entry
 *   bank_only — in bank, no ledger entry (need to create or ignore)
 *   ledger_only — in ledger but not in this bank statement (timing or error)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch statement (RLS ensures org ownership)
  const { data: statement } = await supabase
    .from('bank_statements')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!statement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch all bank lines
  const { data: lines } = await supabase
    .from('bank_statement_lines')
    .select('*, ledger_transactions(id, date, amount_total, entry_type, vendor_norm, payer, memo, receipt_categories(name))')
    .eq('statement_id', id)
    .order('line_date', { ascending: true })

  // Fetch ledger entries in the statement period that are NOT bank-cleared
  // (in ledger but not showing in this bank statement)
  const ledgerOnlyQuery = supabase
    .from('ledger_transactions')
    .select('id, date, amount_total, entry_type, vendor_norm, payer, memo, receipt_categories(name)')
    .eq('user_id', profile.org_id)
    .eq('status', 'posted')
    .eq('bank_cleared', false)

  if (statement.statement_start) {
    ledgerOnlyQuery.gte('date', statement.statement_start)
  }
  if (statement.statement_end) {
    ledgerOnlyQuery.lte('date', statement.statement_end)
  }

  const { data: ledgerOnly } = await ledgerOnlyQuery.limit(200)

  const allLines = lines ?? []

  return NextResponse.json({
    statement,
    buckets: {
      matched:     allLines.filter(l => l.match_status === 'matched'),
      bank_only:   allLines.filter(l => l.match_status === 'pending'),
      cleared:     allLines.filter(l => l.match_status === 'cleared'),
      ignored:     allLines.filter(l => l.match_status === 'ignored'),
      ledger_only: ledgerOnly ?? [],
    },
    summary: {
      total_lines:  allLines.length,
      matched:      allLines.filter(l => l.match_status === 'matched').length,
      pending:      allLines.filter(l => l.match_status === 'pending').length,
      cleared:      allLines.filter(l => l.match_status === 'cleared').length,
      ignored:      allLines.filter(l => l.match_status === 'ignored').length,
      ledger_only:  (ledgerOnly ?? []).length,
    },
  })
}
