import { Activity, VoiceCall, type Customer, type LeadIntentTier } from '@/types'
import { LEAD_INTENT_TIER_LABELS } from '@/lib/leads/intent'

export type QueueItemType =
  | 'new_lead'
  | 'appt_request'
  | 'voice_lead'
  | 'vehicle_match'
  | 'overdue_followup'
  | 'overdue_task'
  | 'today_followup'
  | 'today_task'
  | 'waiting_responded'
  | 'waiting'

export interface QueueItem {
  key: string
  tier: number
  urgencyScore: number
  type: QueueItemType
  customerId?: string
  decision: QueueDecision
  data: Activity | VoiceCall
}

export type NextBestAction =
  | 'call_now'
  | 'text_now'
  | 'send_email'
  | 'send_financing_link'
  | 'confirm_appointment'
  | 'send_followup'
  | 'review_reply'
  | 'wait'

export type IntentTierBadge = 'HOT' | 'WARM' | 'COLD'

export const NEXT_ACTION_LABELS: Record<NextBestAction, string> = {
  call_now: 'Call now',
  text_now: 'Text now',
  send_email: 'Send email',
  send_financing_link: 'Send financing link',
  confirm_appointment: 'Confirm appointment',
  send_followup: 'Send follow-up',
  review_reply: 'Review reply',
  wait: 'Wait',
}

export interface QueueDecision {
  priorityScore: number
  winLikelihood: number
  delayRisk: number
  nextBestAction: NextBestAction
  /** Plain-language CTA from NEXT_ACTION_LABELS */
  nextActionLabel: string
  /** Derived from manual override or model tier */
  intentTierBadge: IntentTierBadge | null
  reasons: string[]
}

export interface BuildQueueOptions {
  /** Phase F: multipliers from org_settings.lead_intent_weights */
  leadWeights?: { hotBoost?: number; warmBoost?: number }
}

export const TIER_LABELS: Record<number, string> = {
  1: 'New Leads',
  2: 'Missed Calls & Appointments',
  3: 'Overdue',
  4: 'Due Today',
  5: 'Waiting on Customer',
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n))
}

function activityText(data: Activity | VoiceCall): string {
  if ('from_number' in data) {
    const summary = data.summary_json
    return [
      summary?.intent ?? '',
      summary?.vehicle_interest ?? '',
      summary?.appointment_exact ?? '',
      summary?.appointment_range ?? '',
      summary?.additional_notes ?? '',
      data.transcript ?? '',
    ].join(' ').toLowerCase()
  }
  return `${data.body ?? ''}`.toLowerCase()
}

function intentSignal(text: string): number {
  const highIntentPhrases = [
    'appointment',
    'test drive',
    'come in',
    'available today',
    'down payment',
    'finance',
    'financing',
    'trade in',
    'trade-in',
    'buy',
    'monthly payment',
  ]
  const hits = highIntentPhrases.reduce((acc, phrase) => acc + (text.includes(phrase) ? 1 : 0), 0)
  return clamp(hits / 4)
}

function contactabilitySignal(data: Activity | VoiceCall): number {
  const customer = (data as Activity).customer ?? (data as VoiceCall).customer ?? null
  if (!customer) return 0
  const hasPhone = !!customer.primary_phone
  const hasEmail = 'email' in customer && !!customer.email
  return (hasPhone ? 0.6 : 0) + (hasEmail ? 0.4 : 0)
}

type QueueCustomerIntent = Pick<
  Customer,
  | 'lead_intent_score'
  | 'lead_intent_tier'
  | 'lead_intent_flags'
  | 'lead_intent_manual_tier'
  | 'lead_intent_manual_expires_at'
  | 'lead_intent_summary'
  | 'lead_intent_score_error'
  | 'lead_intent_next_action'
  | 'repeat_lead'
  | 'avg_reply_speed_minutes'
  | 'inbound_message_count'
  | 'prior_purchase_count'
>

function manualTierEffective(c: Partial<QueueCustomerIntent> | null | undefined): LeadIntentTier | null {
  if (!c?.lead_intent_manual_tier || !c.lead_intent_manual_expires_at) return null
  if (new Date(c.lead_intent_manual_expires_at) <= new Date()) return null
  return c.lead_intent_manual_tier
}

function intentTierBadgeLabel(
  manual: LeadIntentTier | null,
  stored: LeadIntentTier | null | undefined,
): IntentTierBadge | null {
  const t = manual ?? stored
  if (!t) return null
  if (t === 'hot') return 'HOT'
  if (t === 'warm') return 'WARM'
  return 'COLD'
}

const STORED_NEXT_ACTIONS: Record<string, NextBestAction> = {
  call_now: 'call_now',
  text_now: 'text_now',
  send_financing_link: 'send_financing_link',
  confirm_appointment: 'confirm_appointment',
  send_followup: 'send_followup',
  wait: 'wait',
}

function mergeNextBestAction(
  customer: Partial<QueueCustomerIntent> | null | undefined,
  fallback: NextBestAction,
  _type: QueueItemType,
  _hasResponded: boolean,
): NextBestAction {
  const raw = customer?.lead_intent_next_action?.trim()
  if (raw && STORED_NEXT_ACTIONS[raw]) return STORED_NEXT_ACTIONS[raw]
  return fallback
}

function combinedIntentSignal(
  text: string,
  customer: Partial<QueueCustomerIntent> | null | undefined,
  ageMinutes: number,
): number {
  const keyword = intentSignal(text)
  const score = customer?.lead_intent_score
  if (score == null && score !== 0) return keyword
  const stored01 = clamp((score ?? 0) / 100)
  if (ageMinutes >= 2 || stored01 >= 0.35) {
    return Math.max(keyword, stored01)
  }
  return keyword
}

function inferAction(type: QueueItemType, data: Activity | VoiceCall, hasResponded: boolean): NextBestAction {
  if (type === 'appt_request') return 'confirm_appointment'
  if (type === 'voice_lead') return 'call_now'
  if (hasResponded) return 'review_reply'
  if (type === 'overdue_followup' || type === 'today_followup') return 'send_followup'
  if (type === 'waiting') return 'wait'
  if (type === 'waiting_responded') return 'review_reply'

  if ('from_number' in data) return 'call_now'
  if (data.type === 'call') return 'call_now'
  if (data.type === 'sms' || data.type === 'sms_followup') return 'text_now'
  if (data.type === 'email' || data.type === 'email_followup') return 'send_email'
  if (data.type === 'appointment') return 'confirm_appointment'
  return 'review_reply'
}

function decisionForItem(args: {
  tier: number
  type: QueueItemType
  data: Activity | VoiceCall
  now: Date
  hasResponded: boolean
  overdueHours?: number
  dueSoonHours?: number
  leadWeights?: { hotBoost?: number; warmBoost?: number }
}): QueueDecision {
  const { tier, type, data, now, hasResponded, overdueHours = 0, leadWeights } = args
  const hasDueSoon = args.dueSoonHours !== undefined
  const dueSoonHours = args.dueSoonHours ?? 0

  const createdAt = new Date(('created_at' in data ? data.created_at : now.toISOString()))
  const ageMinutes = Math.max(0, (now.getTime() - createdAt.getTime()) / 60_000)
  const freshness = clamp(1 - ageMinutes / 180)
  const delayFromAge = clamp(ageMinutes / 90)
  const delayFromOverdue = clamp(overdueHours / 8)
  const delayFromDueSoon = hasDueSoon ? clamp(1 - dueSoonHours / 6) : 0
  const delayRisk = clamp(Math.max(delayFromAge, delayFromOverdue, delayFromDueSoon))

  const text = activityText(data)
  const customer = ((data as Activity).customer ?? (data as VoiceCall).customer ?? null) as
    Partial<QueueCustomerIntent> | null
  const intent = combinedIntentSignal(text, customer, ageMinutes)
  const contactability = contactabilitySignal(data)
  const manualTier = manualTierEffective(customer)
  const modelTier = customer?.lead_intent_tier as LeadIntentTier | undefined
  const effTier = manualTier ?? modelTier ?? null

  let winLikelihood = 0.15 + freshness * 0.25 + intent * 0.28 + contactability * 0.20
  if (type === 'voice_lead' || type === 'appt_request' || type === 'vehicle_match') winLikelihood += 0.08
  if (hasResponded) winLikelihood += 0.2
  if (manualTier === 'hot') winLikelihood += 0.12
  else if (manualTier === 'warm') winLikelihood += 0.06
  else if (manualTier === 'active') winLikelihood += 0.03

  if (leadWeights?.hotBoost && effTier === 'hot') {
    winLikelihood = clamp(winLikelihood * leadWeights.hotBoost, 0.05, 0.98)
  }
  if (leadWeights?.warmBoost && effTier === 'warm') {
    winLikelihood = clamp(winLikelihood * leadWeights.warmBoost, 0.05, 0.98)
  }

  if (customer?.repeat_lead) winLikelihood += 0.25
  const avg = customer?.avg_reply_speed_minutes
  if (avg != null && avg >= 0 && avg < 10) winLikelihood += 0.15
  if ((customer?.inbound_message_count ?? 0) > 4) winLikelihood += 0.1
  if ((customer?.prior_purchase_count ?? 0) > 0) winLikelihood += 0.15

  const flags = customer?.lead_intent_flags
  if (Array.isArray(flags) && flags.includes('repeat_inquiry')) {
    winLikelihood += 0.08
  }

  winLikelihood = clamp(winLikelihood, 0.05, 0.98)

  let tier1RepeatBoost = 0
  if (tier === 1 && customer?.repeat_lead) tier1RepeatBoost = 55

  const tierBase: Record<number, number> = { 1: 500, 2: 420, 3: 340, 4: 260, 5: 180 }
  const priorityScore =
    tierBase[tier] +
    tier1RepeatBoost +
    winLikelihood * 200 +
    delayRisk * 140 +
    intent * 130 +
    contactability * 50 +
    (hasResponded ? 80 : 0)

  const reasons: string[] = []
  if (customer?.lead_intent_summary?.trim()) {
    reasons.push(customer.lead_intent_summary.trim())
  }
  if (customer?.repeat_lead) {
    reasons.push('Repeat lead — prioritize')
  }
  if (customer?.lead_intent_score_error) {
    reasons.push('Intent scoring unavailable — using rules only')
  }
  if (manualTier) {
    reasons.push(`Staff override: ${LEAD_INTENT_TIER_LABELS[manualTier]}`)
  }
  if (hasResponded) reasons.push('Customer replied recently')
  if (intent >= 0.5) reasons.push('High-intent buying signals')
  if (delayRisk >= 0.65) reasons.push('Delay risk is high')
  if (freshness >= 0.75 && tier <= 2) reasons.push('Fresh lead momentum')
  if (contactability >= 0.6) reasons.push('Contact channel available')
  const avgR = customer?.avg_reply_speed_minutes
  if (avgR != null && avgR >= 0 && avgR < 10) reasons.push('Fast historical responder')
  if ((customer?.prior_purchase_count ?? 0) > 0) reasons.push('Prior purchaser')

  const seen = new Set<string>()
  const deduped = reasons.filter(r => {
    const k = r.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  while (deduped.length > 5) deduped.pop()
  if (deduped.length === 0) deduped.push('Standard priority by SLA and activity type')

  const fallbackAction = inferAction(type, data, hasResponded)
  const nextBestAction = mergeNextBestAction(customer, fallbackAction, type, hasResponded)

  return {
    priorityScore: Math.round(priorityScore),
    winLikelihood,
    delayRisk,
    nextBestAction,
    nextActionLabel: NEXT_ACTION_LABELS[nextBestAction],
    intentTierBadge: intentTierBadgeLabel(manualTier, modelTier),
    reasons: deduped,
  }
}

export function buildQueue(
  newLeads: Activity[],
  apptRequests: Activity[],
  voiceLeads: VoiceCall[],
  tasks: Activity[],
  waiting: Activity[],
  respondedCustomerIds: string[],
  vehicleMatches: Activity[] = [],
  options?: BuildQueueOptions,
): QueueItem[] {
  const now = new Date()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const lw = options?.leadWeights

  const followUpTasks = tasks.filter(a =>
    a.type === 'email_followup' || a.type === 'sms_followup' ||
    (a.type === 'email' && a.sequence_day != null) ||
    (a.type === 'sms' && a.sequence_day != null)
  )
  const regularTasks = tasks.filter(a =>
    !(a.type === 'email_followup' || a.type === 'sms_followup' ||
    (a.type === 'email' && a.sequence_day != null) ||
    (a.type === 'sms' && a.sequence_day != null))
  )
  const appointments = regularTasks.filter(a => a.type === 'appointment')
  const nonApptTasks = regularTasks.filter(a => a.type !== 'appointment')

  const overdueFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayFollowUps   = followUpTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)
  const overdueTasks     = nonApptTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayTasks       = nonApptTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)

  const items: QueueItem[] = []

  for (const a of newLeads) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 1, type: 'new_lead', data: a, now, hasResponded, leadWeights: lw })
    items.push({
      key: `lead-${a.id}`,
      tier: 1,
      urgencyScore: decision.priorityScore,
      type: 'new_lead',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of vehicleMatches) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 1, type: 'vehicle_match', data: a, now, hasResponded, leadWeights: lw })
    items.push({
      key: `vmatch-${a.id}`,
      tier: 1,
      urgencyScore: decision.priorityScore,
      type: 'vehicle_match',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of apptRequests) {
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 2, type: 'appt_request', data: a, now, hasResponded, leadWeights: lw })
    items.push({
      key: `appt-${a.id}`,
      tier: 2,
      urgencyScore: decision.priorityScore + Math.min(ageH, 72),
      type: 'appt_request',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const v of voiceLeads) {
    const ageH = (now.getTime() - new Date((v as unknown as { created_at: string }).created_at ?? 0).getTime()) / 3_600_000
    const customerId = (v as unknown as { customer?: { id: string } }).customer?.id
    const hasResponded = respondedCustomerIds.includes(customerId ?? '')
    const decision = decisionForItem({ tier: 2, type: 'voice_lead', data: v, now, hasResponded, leadWeights: lw })
    items.push({
      key: `voice-${v.id}`,
      tier: 2,
      urgencyScore: decision.priorityScore + Math.min(ageH, 72),
      type: 'voice_lead',
      customerId,
      decision,
      data: v,
    })
  }

  for (const a of appointments) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = a.due_at ? Math.max(0, (new Date(a.due_at).getTime() - now.getTime()) / 3_600_000) : 0
    const decision = decisionForItem({ tier: 2, type: 'today_task', data: a, now, hasResponded, dueSoonHours, leadWeights: lw })
    items.push({
      key: `sched-${a.id}`,
      tier: 2,
      urgencyScore: decision.priorityScore,
      type: 'today_task',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of overdueFollowUps) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 3, type: 'overdue_followup', data: a, now, hasResponded, overdueHours: overdueH, leadWeights: lw })
    items.push({
      key: `ofu-${a.id}`,
      tier: 3,
      urgencyScore: decision.priorityScore + overdueH,
      type: 'overdue_followup',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of overdueTasks) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 3, type: 'overdue_task', data: a, now, hasResponded, overdueHours: overdueH, leadWeights: lw })
    items.push({
      key: `otask-${a.id}`,
      tier: 3,
      urgencyScore: decision.priorityScore + overdueH,
      type: 'overdue_task',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of todayFollowUps) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = Math.max(0, (new Date(a.due_at!).getTime() - now.getTime()) / 3_600_000)
    const decision = decisionForItem({ tier: 4, type: 'today_followup', data: a, now, hasResponded, dueSoonHours, leadWeights: lw })
    items.push({
      key: `tfu-${a.id}`,
      tier: 4,
      urgencyScore: decision.priorityScore - dueSoonHours,
      type: 'today_followup',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of todayTasks) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = Math.max(0, (new Date(a.due_at!).getTime() - now.getTime()) / 3_600_000)
    const decision = decisionForItem({ tier: 4, type: 'today_task', data: a, now, hasResponded, dueSoonHours, leadWeights: lw })
    items.push({
      key: `ttask-${a.id}`,
      tier: 4,
      urgencyScore: decision.priorityScore - dueSoonHours,
      type: 'today_task',
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  for (const a of waiting) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    const type = hasResponded ? 'waiting_responded' : 'waiting'
    const decision = decisionForItem({ tier: 5, type, data: a, now, hasResponded, leadWeights: lw })
    items.push({
      key: `wait-${a.id}`,
      tier: 5,
      urgencyScore: decision.priorityScore + (hasResponded ? 50 : Math.min(ageH, 72)),
      type,
      customerId: a.customer_id ?? undefined,
      decision,
      data: a,
    })
  }

  return items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (b.decision.priorityScore !== a.decision.priorityScore) {
      return b.decision.priorityScore - a.decision.priorityScore
    }
    return b.urgencyScore - a.urgencyScore
  })
}
