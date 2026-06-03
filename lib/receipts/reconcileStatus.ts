import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * When no bank lines are pending and no uncleared ledger rows remain in the
 * statement period, mark the statement reconciled. Reverts to ready if items reopen.
 */
export async function maybeMarkStatementReconciled(
  supabase: SupabaseClient,
  statementId: string,
  orgId: string,
): Promise<{ reconciled: boolean; pending_lines: number; ledger_only: number }> {
  const { data: statement } = await supabase
    .from('bank_statements')
    .select('statement_start, statement_end, status')
    .eq('id', statementId)
    .eq('user_id', orgId)
    .single()

  if (!statement) return { reconciled: false, pending_lines: 0, ledger_only: 0 }

  const { count: pendingLines } = await supabase
    .from('bank_statement_lines')
    .select('id', { count: 'exact', head: true })
    .eq('statement_id', statementId)
    .eq('match_status', 'pending')

  let ledgerQuery = supabase
    .from('ledger_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', orgId)
    .eq('status', 'posted')
    .eq('bank_cleared', false)

  if (statement.statement_start) ledgerQuery = ledgerQuery.gte('date', statement.statement_start)
  if (statement.statement_end) ledgerQuery = ledgerQuery.lte('date', statement.statement_end)

  const { count: ledgerOnly } = await ledgerQuery

  const pending = pendingLines ?? 0
  const ledgerUncleared = ledgerOnly ?? 0
  const fullyDone = pending === 0 && ledgerUncleared === 0

  if (fullyDone && statement.status !== 'reconciled') {
    await supabase
      .from('bank_statements')
      .update({ status: 'reconciled' })
      .eq('id', statementId)
    return { reconciled: true, pending_lines: 0, ledger_only: 0 }
  }

  if (!fullyDone && statement.status === 'reconciled') {
    await supabase
      .from('bank_statements')
      .update({ status: 'ready' })
      .eq('id', statementId)
  }

  return {
    reconciled: fullyDone,
    pending_lines: pending,
    ledger_only: ledgerUncleared,
  }
}
