import type { ParsedLead } from '@/lib/leads/parser'

export type LeadIntentTier = 'standard' | 'active' | 'warm' | 'hot'
export type LeadIntentFlag =
  | 'appointment'
  | 'warm_shopper'
  | 'reengaged'
  | 'returning_shopper'
  | 'low_competition'
  | 'local_shopper'
  | 'viewed_vdp'
  | 'callback_requested'
  | 'manual_priority'

export interface LeadIntentSnapshot {
  score: number
  tier: LeadIntentTier
  flags: LeadIntentFlag[]
  summary: string | null
  source: string | null
  manualNote: string | null
  updatedAt: string
}

const FLAG_WEIGHTS: Record<LeadIntentFlag, number> = {
  appointment: 50,
  warm_shopper: 35,
  reengaged: 25,
  returning_shopper: 15,
  low_competition: 10,
  local_shopper: 10,
  viewed_vdp: 5,
  callback_requested: 20,
  manual_priority: 15,
}

const FLAG_LABELS: Record<LeadIntentFlag, string> = {
  appointment: 'Appointment interest',
  warm_shopper: 'Above-average close likelihood',
  reengaged: 'Re-engaged shopper',
  returning_shopper: 'Returning shopper',
  low_competition: 'Low competition',
  local_shopper: 'Local shopper',
  viewed_vdp: 'Recently viewed VDP',
  callback_requested: 'Requested callback',
  manual_priority: 'Marked by staff',
}

const UNIQUE_FLAGS: LeadIntentFlag[] = [
  'appointment',
  'warm_shopper',
  'reengaged',
  'returning_shopper',
  'low_competition',
  'local_shopper',
  'viewed_vdp',
  'callback_requested',
  'manual_priority',
]

export const LEAD_INTENT_TIER_LABELS: Record<LeadIntentTier, string> = {
  standard: 'Standard',
  active: 'Active',
  warm: 'Warm Shopper',
  hot: 'Hot Shopper',
}

export const LEAD_INTENT_TIER_STYLES: Record<LeadIntentTier, { rail: string; badge: string; text: string }> = {
  standard: { rail: 'bg-slate-300', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-600' },
  active: { rail: 'bg-sky-500', badge: 'bg-sky-100 text-sky-700', text: 'text-sky-700' },
  warm: { rail: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  hot: { rail: 'bg-red-500', badge: 'bg-red-100 text-red-700', text: 'text-red-700' },
}

export function normalizeLeadIntentFlags(flags: unknown): LeadIntentFlag[] {
  if (!Array.isArray(flags)) return []
  const next = new Set<LeadIntentFlag>()
  for (const flag of flags) {
    if (typeof flag === 'string' && (UNIQUE_FLAGS as string[]).includes(flag)) {
      next.add(flag as LeadIntentFlag)
    }
  }
  return UNIQUE_FLAGS.filter(flag => next.has(flag))
}

export function deriveLeadIntentTier(score: number): LeadIntentTier {
  if (score >= 80) return 'hot'
  if (score >= 50) return 'warm'
  if (score >= 25) return 'active'
  return 'standard'
}

export function buildLeadIntentSummary(flags: LeadIntentFlag[], note?: string | null): string | null {
  const parts = flags.map(flag => FLAG_LABELS[flag])
  if (note?.trim()) parts.push(note.trim())
  if (parts.length === 0) return null
  return parts.join(' • ').slice(0, 280)
}

export function deriveLeadIntentFromLead(lead: ParsedLead, isReturningCustomer: boolean): LeadIntentSnapshot | null {
  const flags = new Set<LeadIntentFlag>(normalizeLeadIntentFlags(lead.signal_flags))

  if (lead.is_reengaged) flags.add('reengaged')
  if (isReturningCustomer) flags.add('returning_shopper')
  if (lead.is_hot && flags.size === 0) flags.add('warm_shopper')

  if (flags.size === 0) return null

  let score = 0
  for (const flag of flags) score += FLAG_WEIGHTS[flag]
  if (lead.is_hot) score += 10
  if (isReturningCustomer) score += 10

  return {
    score,
    tier: deriveLeadIntentTier(score),
    flags: UNIQUE_FLAGS.filter(flag => flags.has(flag)),
    summary: buildLeadIntentSummary(UNIQUE_FLAGS.filter(flag => flags.has(flag)), lead.signal_summary ?? null),
    source: lead.source,
    manualNote: null,
    updatedAt: new Date().toISOString(),
  }
}

export function buildManualLeadIntent(input: {
  tier: LeadIntentTier
  flags?: LeadIntentFlag[]
  note?: string | null
}): LeadIntentSnapshot {
  const flags = new Set<LeadIntentFlag>(normalizeLeadIntentFlags(input.flags))
  flags.add('manual_priority')
  const orderedFlags = UNIQUE_FLAGS.filter(flag => flags.has(flag))

  const tierBase = {
    standard: 0,
    active: 30,
    warm: 60,
    hot: 90,
  }[input.tier]

  const extra = orderedFlags.reduce((sum, flag) => sum + (flag === 'manual_priority' ? 0 : FLAG_WEIGHTS[flag]), 0)
  const score = Math.max(tierBase, Math.min(100, tierBase + extra))

  return {
    score,
    tier: input.tier,
    flags: orderedFlags,
    summary: buildLeadIntentSummary(orderedFlags, input.note ?? null),
    source: 'manual',
    manualNote: input.note?.trim() || null,
    updatedAt: new Date().toISOString(),
  }
}

export function mergeLeadIntent(existing: {
  tier?: string | null
  score?: number | null
  flags?: unknown
  summary?: string | null
  source?: string | null
  manualNote?: string | null
}, incoming: LeadIntentSnapshot): LeadIntentSnapshot {
  const existingFlags = normalizeLeadIntentFlags(existing.flags)
  const mergedFlags = normalizeLeadIntentFlags([...existingFlags, ...incoming.flags])
  const score = Math.max(existing.score ?? 0, incoming.score)
  const tier = deriveLeadIntentTier(score)
  const note = incoming.manualNote ?? existing.manualNote ?? null
  const summary = incoming.summary ?? existing.summary ?? buildLeadIntentSummary(mergedFlags, note)

  return {
    score,
    tier,
    flags: mergedFlags,
    summary,
    source: incoming.source ?? existing.source ?? null,
    manualNote: note,
    updatedAt: incoming.updatedAt,
  }
}
