/**
 * POST /api/receipts/bank-statements/[id]/resolve
 *
 * Resolves a single bank statement line. Actions:
 *   match   — manually match to an existing ledger entry
 *   clear   — mark as cleared (no ledger entry needed, e.g., transfer)
 *   ignore  — permanently ignore this line
 *   unmatch — remove a match (set back to pending)
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

  // Verify statement ownership
  const { data: statement } = await supabase
    .from('bank_statements')
    .select('id, statement_start, statement_end')
    .eq('id', statementId)
    .eq('user_id', profile.org_id)
    .single()

  if (!statement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    line_id: string
    action: 'match' | 'clear' | 'ignore' | 'unmatch'
    ledger_id?: string  // required for action=match
  }

  const { line_id, action, ledger_id } = body

  if (!line_id || !action) {
    return NextResponse.json({ error: 'line_id and action are required' }, { status: 400 })
  }

  // Verify line belongs to this statement
  const { data: line } = await supabase
    .from('bank_statement_lines')
    .select('id, match_status, matched_ledger_id')
    .eq('id', line_id)
    .eq('statement_id', statementId)
    .single()

  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  switch (action) {
    case 'match': {
      if (!ledger_id) return NextResponse.json({ error: 'ledger_id required for match' }, { status: 400 })
      // Verify ledger entry belongs to org
      const { data: entry } = await supabase
        .from('ledger_transactions')
        .select('id')
        .eq('id', ledger_id)
        .eq('user_id', profile.org_id)
        .single()
      if (!entry) return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })

      await supabase
        .from('bank_statement_lines')
        .update({ match_status: 'matched', matched_ledger_id: ledger_id })
        .eq('id', line_id)

      await supabase
        .from('ledger_transactions')
        .update({ bank_cleared: true })
        .eq('id', ledger_id)
      break
    }

    case 'clear': {
      await supabase
        .from('bank_statement_lines')
        .update({ match_status: 'cleared', matched_ledger_id: null })
        .eq('id', line_id)
      break
    }

    case 'ignore': {
      await supabase
        .from('bank_statement_lines')
        .update({ match_status: 'ignored', matched_ledger_id: null })
        .eq('id', line_id)
      break
    }

    case 'unmatch': {
      const prevLedgerId = line.matched_ledger_id
      await supabase
        .from('bank_statement_lines')
        .update({ match_status: 'pending', matched_ledger_id: null })
        .eq('id', line_id)
      // Un-clear the ledger entry if nothing else is matched to it
      if (prevLedgerId) {
        const { count } = await supabase
          .from('bank_statement_lines')
          .select('id', { count: 'exact', head: true })
          .eq('matched_ledger_id', prevLedgerId)
          .neq('id', line_id)
        if ((count ?? 0) === 0) {
          await supabase
            .from('ledger_transactions')
            .update({ bank_cleared: false })
            .eq('id', prevLedgerId)
        }
      }
      break
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const status = await maybeMarkStatementReconciled(supabase, statementId, profile.org_id)

  return NextResponse.json({ ok: true, ...status })
}
