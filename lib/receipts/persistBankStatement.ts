import type { SupabaseClient } from '@supabase/supabase-js'
import { autoMatchLines, type BankStatementLine } from '@/lib/receipts/bankStatementVision'
import { maybeMarkStatementReconciled } from '@/lib/receipts/reconcileStatus'

export interface BankStatementPayload {
  bank_name?: string | null
  account_last4?: string | null
  statement_start?: string | null
  statement_end?: string | null
  opening_balance?: number | null
  closing_balance?: number | null
  lines: BankStatementLine[]
}

export async function persistBankStatement(
  supabase: SupabaseClient,
  orgId: string,
  statementId: string,
  extraction: BankStatementPayload,
  storagePath: string | null,
): Promise<{
  total_lines: number
  auto_matched: number
  unmatched: number
  reconciled: boolean
}> {
  await supabase
    .from('bank_statements')
    .update({
      bank_name: extraction.bank_name ?? null,
      account_last4: extraction.account_last4 ?? null,
      statement_start: extraction.statement_start ?? null,
      statement_end: extraction.statement_end ?? null,
      opening_balance: extraction.opening_balance ?? null,
      closing_balance: extraction.closing_balance ?? null,
      storage_path: storagePath,
      status: 'ready',
      error_message: null,
    })
    .eq('id', statementId)

  const dateFrom = extraction.statement_start
  const dateTo = extraction.statement_end
  let ledgerQuery = supabase
    .from('ledger_transactions')
    .select('id, date, amount_total, entry_type')
    .eq('user_id', orgId)
    .eq('status', 'posted')
  if (dateFrom) ledgerQuery = ledgerQuery.gte('date', dateFrom)
  if (dateTo) ledgerQuery = ledgerQuery.lte('date', dateTo)
  const { data: ledgerEntries } = await ledgerQuery.limit(500)

  const matches = autoMatchLines(extraction.lines, ledgerEntries ?? [])

  const lineRows = extraction.lines.map((line, i) => ({
    statement_id: statementId,
    user_id: orgId,
    line_date: line.date,
    description: line.description,
    amount: line.amount,
    direction: line.direction,
    balance_after: line.balance_after,
    match_status: matches.has(i) ? 'matched' : 'pending',
    matched_ledger_id: matches.get(i) ?? null,
  }))

  await supabase.from('bank_statement_lines').insert(lineRows)

  const matchedLedgerIds = Array.from(matches.values())
  if (matchedLedgerIds.length > 0) {
    await supabase
      .from('ledger_transactions')
      .update({ bank_cleared: true })
      .in('id', matchedLedgerIds)
  }

  const { reconciled } = await maybeMarkStatementReconciled(supabase, statementId, orgId)

  return {
    total_lines: extraction.lines.length,
    auto_matched: matches.size,
    unmatched: extraction.lines.length - matches.size,
    reconciled,
  }
}
