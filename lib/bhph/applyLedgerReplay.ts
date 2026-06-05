import type { SupabaseClient } from '@supabase/supabase-js'
import { replayBhphLedger, type ContractForReplay, type LedgerRowForReplay } from './ledgerReplay'

export async function applyBhphLedgerReplay(
  service: SupabaseClient,
  contractId: string,
  orgId: string,
): Promise<
  | { ok: true; principalBalance: number; totalInterestPaid: number; paymentsUpdated: number }
  | { ok: false; error: string }
> {
  const { data: contract, error: cErr } = await service
    .from('bhph_payments')
    .select(
      'id, loan_amount, down_payment, interest_rate, frequency_anchor_date, created_at, principal_balance',
    )
    .eq('id', contractId)
    .eq('user_id', orgId)
    .maybeSingle()

  if (cErr || !contract) {
    return { ok: false, error: 'Contract not found' }
  }

  const { data: ledger, error: lErr } = await service
    .from('bhph_payment_ledger')
    .select('id, payment_date, amount_paid, payment_type, notes, created_at')
    .eq('bhph_contract_id', contractId)
    .eq('user_id', orgId)
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (lErr) {
    return { ok: false, error: lErr.message }
  }

  const replay = replayBhphLedger(contract as ContractForReplay, (ledger ?? []) as LedgerRowForReplay[])

  for (const row of replay.rows) {
    const { error: uErr } = await service
      .from('bhph_payment_ledger')
      .update({
        interest_portion: row.interest_portion,
        principal_portion: row.principal_portion,
        principal_balance_after: row.principal_balance_after,
        days_since_last: row.days_since_last,
      })
      .eq('id', row.id)
      .eq('bhph_contract_id', contractId)

    if (uErr) {
      return { ok: false, error: uErr.message }
    }
  }

  const { error: contractErr } = await service
    .from('bhph_payments')
    .update({
      principal_balance: replay.principalBalance,
      total_interest_paid: replay.totalInterestPaid,
      total_paid: replay.totalInstallmentsPaid,
      last_payment_date: replay.lastPaymentDate,
    })
    .eq('id', contractId)
    .eq('user_id', orgId)

  if (contractErr) {
    return { ok: false, error: contractErr.message }
  }

  return {
    ok: true,
    principalBalance: replay.principalBalance,
    totalInterestPaid: replay.totalInterestPaid,
    paymentsUpdated: replay.rows.length,
  }
}
