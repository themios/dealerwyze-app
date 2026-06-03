/**
 * POST /api/receipts/bank-statements/[id]/create-entry
 *
 * Creates a ledger entry from an unmatched bank statement line (no receipt image).
 * Links the line as matched and marks the ledger entry bank-cleared.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { maybeMarkStatementReconciled } from '@/lib/receipts/reconcileStatus'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: statementId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: statement } = await supabase
    .from('bank_statements')
    .select('id')
    .eq('id', statementId)
    .eq('user_id', profile.org_id)
    .single()

  if (!statement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    line_id: string
    category_id: string
    vehicle_id?: string | null
    memo?: string | null
  }

  const { line_id, category_id, vehicle_id, memo } = body
  if (!line_id || !category_id) {
    return NextResponse.json({ error: 'line_id and category_id are required' }, { status: 400 })
  }

  const { data: line } = await supabase
    .from('bank_statement_lines')
    .select('id, line_date, description, amount, direction, match_status')
    .eq('id', line_id)
    .eq('statement_id', statementId)
    .eq('user_id', profile.org_id)
    .single()

  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  if (line.match_status !== 'pending') {
    return NextResponse.json({ error: 'Line is already resolved' }, { status: 400 })
  }

  const isIncome = line.direction === 'credit'
  const desc = line.description?.trim() || (isIncome ? 'Bank deposit' : 'Bank charge')

  const { data: receipt, error: receiptErr } = await supabase
    .from('receipts')
    .insert({
      user_id: profile.org_id,
      status: 'posted',
      entry_type: isIncome ? 'income' : 'expense',
      payer: isIncome ? desc : null,
      vendor_norm: isIncome ? null : desc,
      vendor_raw: isIncome ? null : desc,
      total: line.amount,
      receipt_date: line.line_date,
    })
    .select('id')
    .single()

  if (receiptErr || !receipt) {
    return NextResponse.json({ error: 'Failed to create receipt', detail: receiptErr?.message }, { status: 500 })
  }

  const { data: transaction, error: txErr } = await supabase
    .from('ledger_transactions')
    .insert({
      user_id: profile.org_id,
      receipt_id: receipt.id,
      date: line.line_date,
      entry_type: isIncome ? 'income' : 'expense',
      payer: isIncome ? desc : null,
      vendor_norm: isIncome ? null : desc,
      amount_total: line.amount,
      category_id,
      memo: memo ?? line.description,
      vehicle_id: vehicle_id ?? null,
      status: 'posted',
      bank_cleared: true,
    })
    .select('id')
    .single()

  if (txErr || !transaction) {
    await supabase.from('receipts').delete().eq('id', receipt.id)
    return NextResponse.json({ error: 'Failed to create ledger entry', detail: txErr?.message }, { status: 500 })
  }

  await supabase
    .from('bank_statement_lines')
    .update({ match_status: 'matched', matched_ledger_id: transaction.id })
    .eq('id', line_id)

  const status = await maybeMarkStatementReconciled(supabase, statementId, profile.org_id)

  return NextResponse.json({
    ok: true,
    ledger_id: transaction.id,
    receipt_id: receipt.id,
    ...status,
  })
}
