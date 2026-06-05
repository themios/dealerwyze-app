import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

export const runtime = 'nodejs'

interface CommissionSnapshot {
  listing_agent_amount?: number
  buyer_agent_amount?: number
  broker_amount?: number
  gross_commission?: number
  closing_price?: number
  calculated_at?: string
}

interface TransactionRow {
  id: string
  transaction_number: string | null
  closing_date: string | null
  closing_price: number | null
  commission_snapshot: CommissionSnapshot | null
  listing_agent_id: string | null
  buyer_agent_id: string | null
  vehicle: {
    address_line1: string | null
    city: string | null
    state: string | null
  } | null
  listing_agent: { id: string; display_name: string | null } | null
}

/**
 * GET /api/transactions/summary
 * Commission summary for agents (own deals) or admins (all org deals).
 * Reads from commission_snapshot JSONB — never recalculates.
 *
 * Query params:
 *   year     — optional, defaults to current year (capped: only 1 calendar year)
 *   agent_id — optional, honored only by admins for filtering to a single agent
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  // RE vertical gate — dealer orgs cannot access this endpoint
  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .maybeSingle()

  if (!org || org.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams
  const currentYear = new Date().getFullYear()

  // Parse year — default to current year; coerce to integer
  const rawYear = searchParams.get('year')
  const year = rawYear ? parseInt(rawYear, 10) : currentYear
  if (isNaN(year) || year < 2000 || year > currentYear + 1) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  // Use isDealerAdmin strictly — 'agent' role is not admin
  const callerIsAdmin = isDealerAdmin(profile.role)

  // agent_id filter — honored only for admins
  const agentIdFilter = callerIsAdmin ? searchParams.get('agent_id') : null

  try {
    let query = supabase
      .from('transactions')
      .select(`
        id,
        transaction_number,
        closing_date,
        closing_price,
        commission_snapshot,
        listing_agent_id,
        buyer_agent_id,
        vehicle:vehicles!vehicle_id(address_line1, city, state),
        listing_agent:profiles!listing_agent_id(id, display_name)
      `)
      .eq('org_id', profile.org_id)
      .eq('pipeline_status', 'closed')
      .not('closing_date', 'is', null)
      .gte('closing_date', `${year}-01-01`)
      .lte('closing_date', `${year}-12-31`)
      .order('closing_date', { ascending: false })
      .limit(500)

    if (callerIsAdmin) {
      // Admin sees all closed transactions in the org; optionally filter by agent
      if (agentIdFilter) {
        query = query.or(
          `listing_agent_id.eq.${agentIdFilter},buyer_agent_id.eq.${agentIdFilter}`
        )
      }
    } else {
      // Agent sees only their own deals
      query = query.or(
        `listing_agent_id.eq.${profile.id},buyer_agent_id.eq.${profile.id}`
      )
    }

    const { data: rows, error } = await query

    if (error) {
      console.error('[transactions/summary] query error:', error.message, error.details, error.hint)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    const transactions = (rows ?? []) as unknown as TransactionRow[]

    // Build response transaction rows
    type TxnOut = {
      id: string
      transaction_number: string | null
      closing_date: string | null
      closing_price: number
      vehicle_address: string
      gross_commission: number
      listing_agent_amount: number
      buyer_agent_amount: number
      broker_amount: number
      role: 'listing_agent' | 'buyer_agent' | 'admin'
      listing_agent_name: string | null
      listing_agent_id: string | null
    }

    const txnOut: TxnOut[] = transactions.map(row => {
      const snap = row.commission_snapshot ?? {}
      const listingAgentAmount = Number(snap.listing_agent_amount ?? 0)
      const buyerAgentAmount   = Number(snap.buyer_agent_amount   ?? 0)
      const brokerAmount       = Number(snap.broker_amount        ?? 0)
      const grossCommission    = Number(snap.gross_commission     ?? 0)
      const closingPrice       = Number(row.closing_price         ?? 0)

      const v = row.vehicle
      const addressParts = [v?.address_line1, v?.city, v?.state].filter(Boolean)
      const vehicleAddress = addressParts.join(', ') || 'Unknown address'

      // Determine caller's role in this transaction
      let role: TxnOut['role'] = 'admin'
      if (!callerIsAdmin) {
        if (row.listing_agent_id === profile.id) role = 'listing_agent'
        else if (row.buyer_agent_id === profile.id) role = 'buyer_agent'
      }

      const la = row.listing_agent as { id?: string; display_name?: string | null } | null

      return {
        id:                   row.id,
        transaction_number:   row.transaction_number,
        closing_date:         row.closing_date,
        closing_price:        closingPrice,
        vehicle_address:      vehicleAddress,
        gross_commission:     grossCommission,
        listing_agent_amount: listingAgentAmount,
        buyer_agent_amount:   buyerAgentAmount,
        broker_amount:        brokerAmount,
        role,
        listing_agent_name:   la?.display_name ?? null,
        listing_agent_id:     row.listing_agent_id,
      }
    })

    // Compute YTD total for the caller
    let ytdTotal = 0
    if (callerIsAdmin) {
      // Admin YTD = sum of all listing_agent_amounts across org (gross view)
      ytdTotal = txnOut.reduce((sum, t) => sum + t.listing_agent_amount + t.buyer_agent_amount, 0)
    } else {
      // Agent YTD = own listing amounts + own buyer amounts
      for (const row of transactions) {
        const snap = row.commission_snapshot ?? {}
        if (row.listing_agent_id === profile.id) {
          ytdTotal += Number(snap.listing_agent_amount ?? 0)
        }
        if (row.buyer_agent_id === profile.id) {
          ytdTotal += Number(snap.buyer_agent_amount ?? 0)
        }
      }
    }

    // Build agents_summary for admin (TXN-08 broker all-agents view)
    type AgentSummary = {
      agent_id: string
      agent_name: string | null
      ytd_total: number
      deal_count: number
    }

    let agentsSummary: AgentSummary[] | undefined
    if (callerIsAdmin) {
      const agentMap = new Map<string, AgentSummary>()

      for (const row of transactions) {
        const snap = row.commission_snapshot ?? {}
        const la = row.listing_agent as { id?: string; display_name?: string | null } | null

        // Count listing agent
        if (row.listing_agent_id) {
          const agId = row.listing_agent_id
          const existing = agentMap.get(agId)
          const amount = Number(snap.listing_agent_amount ?? 0)
          if (existing) {
            existing.ytd_total += amount
            existing.deal_count += 1
          } else {
            agentMap.set(agId, {
              agent_id:   agId,
              agent_name: la?.display_name ?? null,
              ytd_total:  amount,
              deal_count: 1,
            })
          }
        }

        // Count buyer agent separately (different agent on co-broke deals)
        if (row.buyer_agent_id && row.buyer_agent_id !== row.listing_agent_id) {
          const agId = row.buyer_agent_id
          const existing = agentMap.get(agId)
          const amount = Number(snap.buyer_agent_amount ?? 0)
          if (existing) {
            existing.ytd_total += amount
            existing.deal_count += 1
          } else {
            agentMap.set(agId, {
              agent_id:   agId,
              agent_name: null, // buyer agent name not joined — acceptable for MVP
              ytd_total:  amount,
              deal_count: 1,
            })
          }
        }
      }

      agentsSummary = Array.from(agentMap.values()).sort((a, b) => b.ytd_total - a.ytd_total)
    }

    return NextResponse.json({
      year,
      ytd_total:      ytdTotal,
      transactions:   txnOut,
      ...(agentsSummary !== undefined ? { agents_summary: agentsSummary } : {}),
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
