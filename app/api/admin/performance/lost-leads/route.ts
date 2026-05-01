import { NextRequest, NextResponse } from 'next/server'

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManagePerformance, csvEscape, resolveCappedDateRange } from '@/lib/intelligence/performance'
import { orgLostLeadExportLimiter } from '@/lib/rateLimit/upstash'

const VALID_REASONS = new Set(['ghost', 'manual', 'post_last_ditch', 'bulk'])
const VALID_LOSS_REASONS = new Set(['price', 'timing', 'competitor', 'not_ready', 'no_contact', 'other'])
const VALID_INTENT_TIERS = new Set(['standard', 'active', 'warm', 'hot'])

/** Narrow filter chain type — avoids Supabase generic recursion in `applyLostLeadFilters`. */
type LostLeadAuditFilterChain = {
  eq: (column: string, value: unknown) => LostLeadAuditFilterChain
  gte: (column: string, value: string) => LostLeadAuditFilterChain
  lte: (column: string, value: string) => LostLeadAuditFilterChain
  lt: (column: string, value: string) => LostLeadAuditFilterChain
  limit: (count: number) => LostLeadAuditFilterChain
} & PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>

/** Embedded FK selects on `lost_lead_audit` exceed TS inference depth; use shallow client for these queries only. */
type LostLeadAuditQueryClient = {
  from: (table: 'lost_lead_audit') => {
    select: (columns: string) => LostLeadAuditFilterChain & {
      order: (column: string, options: { ascending: boolean }) => LostLeadAuditFilterChain
    }
  }
}

function applyLostLeadFilters(query: LostLeadAuditFilterChain, args: {
  orgId: string
  fromIso: string
  toIso: string
  assignedRepId?: string | null
  archiveReason?: string | null
  lossReason?: string | null
  intentTier?: string | null
  cursor?: string | null
  limit?: number
}) {
  let next = query
    .eq('org_id', args.orgId)
    .gte('archived_at', args.fromIso)
    .lte('archived_at', args.toIso)

  if (args.assignedRepId) next = next.eq('assigned_rep_id', args.assignedRepId)
  if (args.archiveReason) next = next.eq('archive_reason', args.archiveReason)
  if (args.lossReason) next = next.eq('loss_reason', args.lossReason)
  if (args.intentTier) next = next.eq('intent_tier', args.intentTier)
  if (args.cursor) next = next.lt('archived_at', args.cursor)
  if (args.limit) next = next.limit(args.limit)
  return next
}

function mode<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? null
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const canSeeAll = canManagePerformance(profile)
  const supabase = createServiceClient()
  const auditDb = supabase as unknown as LostLeadAuditQueryClient
  const { searchParams } = new URL(req.url)

  const assignedRepIdParam = searchParams.get('assigned_rep_id')
  const assignedRepId = canSeeAll ? assignedRepIdParam : profile.id
  const archiveReason = VALID_REASONS.has(searchParams.get('archive_reason') ?? '') ? searchParams.get('archive_reason') : null
  const lossReason = VALID_LOSS_REASONS.has(searchParams.get('loss_reason') ?? '') ? searchParams.get('loss_reason') : null
  const intentTier = VALID_INTENT_TIERS.has(searchParams.get('intent_tier') ?? '') ? searchParams.get('intent_tier') : null
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100)
  const cursor = searchParams.get('cursor')
  const format = searchParams.get('format')
  const range = resolveCappedDateRange(searchParams.get('from'), searchParams.get('to'))
  const fromIso = range.from.toISOString()
  const toIso = range.to.toISOString()

  if (format === 'csv') {
    const rate = await orgLostLeadExportLimiter(profile.org_id)
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Please wait before exporting again.' }, { status: 429 })
    }
  }

  const baseSelect = `
    id,
    activity_id,
    customer_id,
    assigned_rep_id,
    last_human_actor_id,
    archive_reason,
    loss_reason,
    intent_tier,
    intent_score,
    lead_source,
    touches,
    last_inbound_at,
    archived_at,
    reinstated_at,
    root_cause_json,
    root_cause_confidence,
    root_cause_needs_review,
    customer:customers!lost_lead_audit_customer_id_fkey(id, name, interested_in),
    assigned_rep:profiles!lost_lead_audit_assigned_rep_id_fkey(id, display_name),
    last_actor:profiles!lost_lead_audit_last_human_actor_id_fkey(id, display_name)
  `

  const rowsQuery = applyLostLeadFilters(
    auditDb
      .from('lost_lead_audit')
      .select(baseSelect)
      .order('archived_at', { ascending: false }),
    {
      orgId: profile.org_id,
      fromIso,
      toIso,
      assignedRepId,
      archiveReason,
      lossReason,
      intentTier,
      cursor,
      limit: format === 'csv' ? 5000 : limit + 1,
    },
  )

  const summaryQuery = applyLostLeadFilters(
    auditDb
      .from('lost_lead_audit')
      .select('archive_reason, loss_reason, intent_score, reinstated_at'),
    {
      orgId: profile.org_id,
      fromIso,
      toIso,
      assignedRepId,
      archiveReason,
      lossReason,
      intentTier,
      limit: 5000,
    },
  )

  const repsQuery = canSeeAll
    ? supabase
        .from('profiles')
        .select('id, display_name, role')
        .eq('org_id', profile.org_id)
        .in('role', ['dealer_admin', 'dealer_manager', 'dealer_finance', 'dealer_rep', 'dealer_staff', 'admin', 'agent'])
        .order('display_name', { ascending: true })
    : Promise.resolve({ data: [], error: null })

  const [{ data: rows, error }, { data: summaryRows }, { data: reps }] = await Promise.all([
    rowsQuery,
    summaryQuery,
    repsQuery,
  ])

  if (error) {
    return NextResponse.json({ error: 'Failed to load lost leads.' }, { status: 500 })
  }

  const normalizedRows = (rows ?? []).map(raw => {
    const row = raw as Record<string, unknown>
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer
    const assignedRep = Array.isArray(row.assigned_rep) ? row.assigned_rep[0] : row.assigned_rep
    const lastActor = Array.isArray(row.last_actor) ? row.last_actor[0] : row.last_actor
    const lastInboundAt = typeof row.last_inbound_at === 'string' ? row.last_inbound_at : null
    const daysSinceLastReply = lastInboundAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastInboundAt).getTime()) / 86_400_000))
      : null

    const cust = customer && typeof customer === 'object' ? customer as Record<string, unknown> : null
    const ar = assignedRep && typeof assignedRep === 'object' ? assignedRep as Record<string, unknown> : null
    const la = lastActor && typeof lastActor === 'object' ? lastActor as Record<string, unknown> : null

    const root = (row.root_cause_json && typeof row.root_cause_json === 'object')
      ? (row.root_cause_json as Record<string, unknown>)
      : null
    const rootFailureMode = root && typeof root.failure_mode === 'string' ? root.failure_mode : null
    const rootCoachingNote = root && typeof root.coaching_note === 'string' ? root.coaching_note : null
    const rootConfidence = typeof row.root_cause_confidence === 'number' ? row.root_cause_confidence : null
    const rootNeedsReview = !!row.root_cause_needs_review

    return {
      id: String(row.id ?? ''),
      activity_id: (row.activity_id ?? null) as string | null,
      customer_id: String(row.customer_id ?? ''),
      archived_at: String(row.archived_at ?? ''),
      archive_reason: String(row.archive_reason ?? ''),
      loss_reason: (row.loss_reason ?? null) as string | null,
      intent_tier: (row.intent_tier ?? null) as string | null,
      intent_score: typeof row.intent_score === 'number' ? row.intent_score : null,
      lead_source: (row.lead_source ?? null) as string | null,
      touches: typeof row.touches === 'number' ? row.touches : null,
      last_inbound_at: lastInboundAt,
      days_since_last_reply: daysSinceLastReply,
      reinstated_at: typeof row.reinstated_at === 'string' ? row.reinstated_at : null,
      ai_root_cause_status: row.root_cause_json ? (row.root_cause_needs_review ? 'needs_review' : 'available') : 'pending',
      root_cause: row.root_cause_json ? {
        failure_mode: rootFailureMode,
        coaching_note: rootCoachingNote,
        confidence: rootConfidence,
        needs_review: rootNeedsReview,
      } : null,
      customer: cust ? {
        id: String(cust.id ?? ''),
        name: String(cust.name ?? ''),
        interested_in: (cust.interested_in ?? null) as string | null,
      } : null,
      assigned_rep: ar ? { id: String(ar.id ?? ''), display_name: String(ar.display_name ?? '') } : null,
      last_actor: la ? { id: String(la.id ?? ''), display_name: String(la.display_name ?? '') } : null,
    }
  })

  const rowsForViewer = normalizedRows.map(row => {
    if (canSeeAll) return row
    return {
      ...row,
      root_cause: null,
      ai_root_cause_status: 'not_shown',
    }
  })

  if (format === 'csv') {
    await supabase.from('ai_usage_log').insert({
      org_id: profile.org_id,
      event_type: 'export_lost_leads',
      tokens_in: 0,
      tokens_out: 0,
      model: 'deterministic',
    })

    const lines = [
      'customer,vehicle_interest,assigned_rep,last_actor,archived_at,archive_reason,loss_reason,intent_tier,intent_score,touches,days_since_last_reply,ai_root_cause_status,root_cause_failure_mode,root_cause_confidence',
      ...rowsForViewer.map(row => [
        csvEscape(row.customer?.name ?? ''),
        csvEscape(row.customer?.interested_in ?? ''),
        csvEscape(row.assigned_rep?.display_name ?? ''),
        csvEscape(row.last_actor?.display_name ?? ''),
        csvEscape(row.archived_at),
        csvEscape(row.archive_reason),
        csvEscape(row.loss_reason ?? ''),
        csvEscape(row.intent_tier ?? ''),
        csvEscape(row.intent_score ?? ''),
        csvEscape(row.touches ?? ''),
        csvEscape(row.days_since_last_reply ?? ''),
        csvEscape(row.ai_root_cause_status),
        csvEscape(canSeeAll ? (row.root_cause?.failure_mode ?? '') : ''),
        csvEscape(canSeeAll && row.root_cause?.confidence != null ? row.root_cause.confidence : ''),
      ].join(',')),
    ]

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="lost-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  const summaryItems = (summaryRows ?? []) as Array<Record<string, unknown>>
  const totalLost = summaryItems.length
  const avgIntentScore = totalLost > 0
    ? Math.round(summaryItems.reduce((sum, row) => sum + (typeof row.intent_score === 'number' ? row.intent_score : 0), 0) / totalLost)
    : 0
  const reinstatedCount = summaryItems.filter(row => typeof row.reinstated_at === 'string').length
  const mostCommonArchiveReason = mode(
    summaryItems.map(row => (typeof row.archive_reason === 'string' ? row.archive_reason : '')).filter(Boolean) as string[],
  )
  const mostCommonLossReason = mode(
    summaryItems.map(row => (typeof row.loss_reason === 'string' ? row.loss_reason : '')).filter(Boolean) as string[],
  )

  const hasNextPage = rowsForViewer.length > limit
  const pageRows = hasNextPage ? rowsForViewer.slice(0, limit) : rowsForViewer
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1]?.archived_at ?? null : null

  return NextResponse.json({
    rows: pageRows,
    nextCursor,
    viewerMode: canSeeAll ? 'admin' : 'self',
    capped: range.capped,
    summary: {
      totalLost,
      avgIntentScore,
      mostCommonArchiveReason,
      mostCommonLossReason,
      reinstateRate: totalLost > 0 ? Math.round((reinstatedCount / totalLost) * 100) : 0,
    },
    reps: (reps ?? []).map(rep => ({ id: rep.id, display_name: rep.display_name })),
  })
}
