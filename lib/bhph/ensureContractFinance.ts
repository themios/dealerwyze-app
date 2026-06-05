import type { SupabaseClient } from '@supabase/supabase-js'
import { applyBhphLedgerReplay } from './applyLedgerReplay'
import {
  contractNeedsFinanceRepair,
  contractNeedsLedgerReplay,
  contractNeedsPrincipalSeed,
  principalSeedBeforePayments,
  type BhphContractFinanceRow,
  type LedgerRowForFinanceCheck,
} from './contractFinance'

const CONTRACT_SELECT =
  'id, loan_amount, down_payment, total_paid, principal_balance, interest_rate, frequency_anchor_date, created_at, status'

export type EnsureBhphFinanceResult =
  | {
      ok: true
      repaired: boolean
      principalSeeded: boolean
      ledgerReplayed: boolean
      principalBalance?: number
      totalInterestPaid?: number
    }
  | { ok: false; error: string }

async function loadContractFinance(
  service: SupabaseClient,
  contractId: string,
  orgId: string,
): Promise<
  | { contract: BhphContractFinanceRow; ledger: LedgerRowForFinanceCheck[] }
  | { error: string }
> {
  const { data: contract, error: cErr } = await service
    .from('bhph_payments')
    .select(CONTRACT_SELECT)
    .eq('id', contractId)
    .eq('user_id', orgId)
    .maybeSingle()

  if (cErr || !contract) {
    return { error: 'Contract not found' }
  }

  const { data: ledger, error: lErr } = await service
    .from('bhph_payment_ledger')
    .select(
      'id, payment_date, amount_paid, payment_type, notes, created_at, interest_portion, days_since_last',
    )
    .eq('bhph_contract_id', contractId)
    .eq('user_id', orgId)
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (lErr) {
    return { error: lErr.message }
  }

  return {
    contract: contract as BhphContractFinanceRow,
    ledger: (ledger ?? []) as LedgerRowForFinanceCheck[],
  }
}

/**
 * Seeds principal_balance when APR is set but tracking was never started,
 * then replays the ledger when splits are missing or stale.
 */
export async function ensureBhphContractFinance(
  service: SupabaseClient,
  contractId: string,
  orgId: string,
): Promise<EnsureBhphFinanceResult> {
  const loaded = await loadContractFinance(service, contractId, orgId)
  if ('error' in loaded) {
    return { ok: false, error: loaded.error }
  }

  const { contract, ledger } = loaded
  if (!contractNeedsFinanceRepair(contract, ledger)) {
    return {
      ok: true,
      repaired: false,
      principalSeeded: false,
      ledgerReplayed: false,
      principalBalance:
        contract.principal_balance != null
          ? Number(contract.principal_balance)
          : undefined,
    }
  }

  let principalSeeded = false
  if (contractNeedsPrincipalSeed(contract)) {
    const seed = principalSeedBeforePayments(contract)
    if (seed != null && seed >= 0) {
      const { error: seedErr } = await service
        .from('bhph_payments')
        .update({ principal_balance: seed })
        .eq('id', contractId)
        .eq('user_id', orgId)

      if (seedErr) {
        return { ok: false, error: seedErr.message }
      }
      contract.principal_balance = seed
      principalSeeded = true
    }
  }

  const needsReplay =
    ledger.length > 0 &&
    (principalSeeded || contractNeedsLedgerReplay(contract, ledger))

  if (!needsReplay) {
    return {
      ok: true,
      repaired: principalSeeded,
      principalSeeded,
      ledgerReplayed: false,
      principalBalance:
        contract.principal_balance != null
          ? Number(contract.principal_balance)
          : undefined,
    }
  }

  const replay = await applyBhphLedgerReplay(service, contractId, orgId)
  if (!replay.ok) {
    return { ok: false, error: replay.error }
  }

  return {
    ok: true,
    repaired: true,
    principalSeeded,
    ledgerReplayed: true,
    principalBalance: replay.principalBalance,
    totalInterestPaid: replay.totalInterestPaid,
  }
}

export type RepairOrgBhphResult = {
  ok: true
  scanned: number
  repaired: number
  errors: Array<{ contractId: string; error: string }>
}

/** Repair all active interest-bearing contracts for an org. */
export async function repairOrgBhphContracts(
  service: SupabaseClient,
  orgId: string,
): Promise<RepairOrgBhphResult | { ok: false; error: string }> {
  const { data: contracts, error } = await service
    .from('bhph_payments')
    .select('id')
    .eq('user_id', orgId)
    .eq('status', 'active')
    .gt('interest_rate', 0)

  if (error) {
    return { ok: false, error: error.message }
  }

  const ids = (contracts ?? []).map((c) => c.id as string)
  let repaired = 0
  const errors: Array<{ contractId: string; error: string }> = []

  for (const contractId of ids) {
    const result = await ensureBhphContractFinance(service, contractId, orgId)
    if (!result.ok) {
      errors.push({ contractId, error: result.error })
      continue
    }
    if (result.repaired) repaired += 1
  }

  return { ok: true, scanned: ids.length, repaired, errors }
}
