import { Activity, VoiceCall, type Customer, type LeadIntentTier } from '@/types'
import { LEAD_INTENT_TIER_LABELS } from '@/lib/leads/intent'
import { computeRepAttentionScore } from '@/lib/today/repAttentionScore'
import type { TakeoverSignal } from '@/lib/today/takeoverDetector'

export type QueueItemType =
  | 'new_lead'
  | 'appt_request'
  | 'voice_lead'
  | 'vehicle_match'
  | 'overdue_followup'
  | 'today_followup'
  | 'waiting_responded'
  | 'waiting'

export type TodaySection =
  | 'replied'
  | 'human_now'
  | 'ai_handling'
  | 'follow_up_later'
  | 'low_roi'

export const TODAY_SECTION_LABELS: Record<TodaySection, string> = {
  replied: 'Replied / Take Over',
  human_now: 'Human Now',
  ai_handling: 'AI Is Handling',
  follow_up_later: 'Follow Up Later',
  low_roi: 'Low ROI / Stop Chasing',
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
  nextActionLabel: string
  intentTierBadge: IntentTierBadge | null
  reasons: string[]
}

export interface SequenceStatusLite {
  id: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  sequence_name: string
  next_step_due?: string | null
}

export interface QueueItem {
  key: string
  type: QueueItemType
  customerId?: string
  data: Activity | VoiceCall
  decision: QueueDecision
  section: TodaySection
  repAttentionScore: number
  hasResponded: boolean
  hasActiveSequence: boolean
  takeoverSignal?: TakeoverSignal | null
}

export interface BuildQueueOptions {
  leadWeights?: { hotBoost?: number; warmBoost?: number }
  sequenceStatusMap?: Record<string, SequenceStatusLite>
  takeoverSignalsByCustomer?: Record<string, TakeoverSignal | null>
}

export interface BuildQueueResult {
  items: QueueItem[]
  counts: Record<TodaySection, number>
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
  | 'last_inbound_at'
  | 'last_outbound_at'
  | 'primary_phone'
  | 'sms_opt_out'
>

type TodayAnnotatedActivity = Activity & {
  outbound_touch_count?: number
}

const SECTION_ORDER: TodaySection[] = ['replied', 'human_now', 'ai_handling', 'follow_up_later', 'low_roi']
const GHOST_OUTBOUND_MIN = 3
const GHOST_SILENCE_DAYS = 7

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
  const phrases = [
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
  const hits = phrases.reduce((acc, phrase) => acc + (text.includes(phrase) ? 1 : 0), 0)
  return clamp(hits / 4)
}

function contactabilitySignal(data: Activity | VoiceCall): number {
  const customer = (data as Activity).customer ?? (data as VoiceCall).customer ?? null
  if (!customer) return 0
  const hasPhone = !!customer.primary_phone
  const hasEmail = 'email' in customer && !!customer.email
  return (hasPhone ? 0.6 : 0) + (hasEmail ? 0.4 : 0)
}

function manualTierEffective(c: Partial<QueueCustomerIntent> | null | undefined): LeadIntentTier | null {
  if (!c?.lead_intent_manual_tier || !c.lead_intent_manual_expires_at) return null
  if (new Date(c.lead_intent_manual_expires_at) <= new Date()) return null
  return c.lead_intent_manual_tier
}

function intentTierBadgeLabel(
  manual: LeadIntentTier | null,
  stored: LeadIntentTier | null | undefined,
): IntentTierBadge | null {
  const tier = manual ?? stored
  if (!tier) return null
  if (tier === 'hot') return 'HOT'
  if (tier === 'warm') return 'WARM'
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
  if (ageMinutes >= 2 || stored01 >= 0.35) return Math.max(keyword, stored01)
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
  type: QueueItemType
  data: Activity | VoiceCall
  now: Date
  hasResponded: boolean
  overdueHours?: number
  dueSoonHours?: number
  leadWeights?: { hotBoost?: number; warmBoost?: number }
}): QueueDecision {
  const { type, data, now, hasResponded, overdueHours = 0, leadWeights } = args
  const hasDueSoon = args.dueSoonHours !== undefined
  const dueSoonHours = args.dueSoonHours ?? 0

  const createdAt = new Date('created_at' in data ? data.created_at : now.toISOString())
  const ageMinutes = Math.max(0, (now.getTime() - createdAt.getTime()) / 60_000)
  const freshness = clamp(1 - ageMinutes / 180)
  const delayFromAge = clamp(ageMinutes / 90)
  const delayFromOverdue = clamp(overdueHours / 8)
  const delayFromDueSoon = hasDueSoon ? clamp(1 - dueSoonHours / 6) : 0
  const delayRisk = clamp(Math.max(delayFromAge, delayFromOverdue, delayFromDueSoon))

  const text = activityText(data)
  const customer = ((data as Activity).customer ?? (data as VoiceCall).customer ?? null) as Partial<QueueCustomerIntent> | null
  const intent = combinedIntentSignal(text, customer, ageMinutes)
  const contactability = contactabilitySignal(data)
  const manualTier = manualTierEffective(customer)
  const modelTier = customer?.lead_intent_tier as LeadIntentTier | undefined
  const effectiveTier = manualTier ?? modelTier ?? null

  let winLikelihood = 0.15 + freshness * 0.25 + intent * 0.28 + contactability * 0.20
  if (type === 'voice_lead' || type === 'appt_request' || type === 'vehicle_match') winLikelihood += 0.08
  if (hasResponded) winLikelihood += 0.2
  if (manualTier === 'hot') winLikelihood += 0.12
  else if (manualTier === 'warm') winLikelihood += 0.06
  else if (manualTier === 'active') winLikelihood += 0.03

  if (leadWeights?.hotBoost && effectiveTier === 'hot') {
    winLikelihood = clamp(winLikelihood * leadWeights.hotBoost, 0.05, 0.98)
  }
  if (leadWeights?.warmBoost && effectiveTier === 'warm') {
    winLikelihood = clamp(winLikelihood * leadWeights.warmBoost, 0.05, 0.98)
  }

  if (customer?.repeat_lead) winLikelihood += 0.25
  if ((customer?.avg_reply_speed_minutes ?? 999) < 10) winLikelihood += 0.15
  if ((customer?.inbound_message_count ?? 0) > 4) winLikelihood += 0.1
  if ((customer?.prior_purchase_count ?? 0) > 0) winLikelihood += 0.15
  if (Array.isArray(customer?.lead_intent_flags) && customer.lead_intent_flags.includes('repeat_inquiry')) {
    winLikelihood += 0.08
  }

  winLikelihood = clamp(winLikelihood, 0.05, 0.98)

  const priorityScore =
    winLikelihood * 300 +
    delayRisk * 200 +
    intent * 160 +
    contactability * 60 +
    (hasResponded ? 90 : 0)

  const reasons: string[] = []
  if (customer?.lead_intent_summary?.trim()) reasons.push(customer.lead_intent_summary.trim())
  if (customer?.repeat_lead) reasons.push('Repeat lead — prioritize')
  if (customer?.lead_intent_score_error) reasons.push('Intent scoring unavailable — using rules only')
  if (manualTier) reasons.push(`Staff override: ${LEAD_INTENT_TIER_LABELS[manualTier]}`)
  if (hasResponded) reasons.push('Customer replied recently')
  if (intent >= 0.5) reasons.push('High-intent buying signals')
  if (delayRisk >= 0.65) reasons.push('Delay risk is high')
  if (freshness >= 0.75) reasons.push('Fresh lead momentum')
  if (contactability >= 0.6) reasons.push('Contact channel available')
  if ((customer?.avg_reply_speed_minutes ?? 999) < 10) reasons.push('Fast historical responder')
  if ((customer?.prior_purchase_count ?? 0) > 0) reasons.push('Prior purchaser')

  const deduped = Array.from(new Set(reasons.map(r => r.trim()).filter(Boolean)))
  const fallbackAction = inferAction(type, data, hasResponded)
  const nextBestAction = mergeNextBestAction(customer, fallbackAction)

  return {
    priorityScore: Math.round(priorityScore),
    winLikelihood,
    delayRisk,
    nextBestAction,
    nextActionLabel: NEXT_ACTION_LABELS[nextBestAction],
    intentTierBadge: intentTierBadgeLabel(manualTier, modelTier),
    reasons: deduped.length > 0 ? deduped.slice(0, 5) : ['Standard priority by SLA and activity type'],
  }
}

function isGhostLead(activity: Activity | VoiceCall): boolean {
  if ('from_number' in activity) return false
  const customer = activity.customer
  if (!customer) return false
  const outboundTouches = (activity as TodayAnnotatedActivity).outbound_touch_count ?? 0
  const lastInboundAt = customer.last_inbound_at ? new Date(customer.last_inbound_at).getTime() : 0
  const silentDays = lastInboundAt ? (Date.now() - lastInboundAt) / 86_400_000 : Number.POSITIVE_INFINITY
  const intentScore = customer.lead_intent_score ?? 0
  return outboundTouches >= GHOST_OUTBOUND_MIN && silentDays >= GHOST_SILENCE_DAYS && intentScore < 45
}

function sectionAssignment(args: {
  itemType: QueueItemType
  data: Activity | VoiceCall
  hasResponded: boolean
  hasActiveSequence: boolean
  takeoverSignal: TakeoverSignal | null | undefined
  decision: QueueDecision
}): TodaySection {
  const { itemType, data, hasResponded, hasActiveSequence, takeoverSignal, decision } = args
  const activity = data as Activity
  const now = Date.now()

  if (activity.today_park_until && new Date(activity.today_park_until).getTime() > now) return 'follow_up_later'
  if (activity.today_section_override) return activity.today_section_override
  if (activity.snoozed_until && new Date(activity.snoozed_until).getTime() > now) return 'follow_up_later'

  if (hasResponded || takeoverSignal) return 'replied'
  if (itemType === 'appt_request') return 'human_now'

  const badge = decision.intentTierBadge
  if ((badge === 'HOT' || badge === 'WARM' || itemType === 'new_lead' || itemType === 'voice_lead' || itemType === 'vehicle_match') && !hasActiveSequence) {
    return 'human_now'
  }

  if (hasActiveSequence) return 'ai_handling'
  if (isGhostLead(data)) return 'low_roi'
  if (badge === 'COLD' && decision.winLikelihood < 0.45) return 'low_roi'
  if (itemType === 'waiting') return 'follow_up_later'
  return 'human_now'
}

function addLowRoiReason(item: QueueItem): QueueItem {
  if (item.section !== 'low_roi' || 'from_number' in item.data) return item
  const activity = item.data as TodayAnnotatedActivity
  const customer = item.data.customer
  const reasons = [...item.decision.reasons]
  const touches = activity.outbound_touch_count ?? 0
  const lastInboundAt = customer?.last_inbound_at ? new Date(customer.last_inbound_at).getTime() : 0
  const silentDays = lastInboundAt ? Math.floor((Date.now() - lastInboundAt) / 86_400_000) : GHOST_SILENCE_DAYS
  const ghostReason = `${touches} touches · ${silentDays}+ days silent · low intent`
  if (!reasons.some(r => r.toLowerCase() === ghostReason.toLowerCase())) reasons.unshift(ghostReason)
  return {
    ...item,
    decision: { ...item.decision, reasons: reasons.slice(0, 5) },
  }
}

function compareQueueItems(a: QueueItem, b: QueueItem): number {
  const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
  if (sectionDiff !== 0) return sectionDiff
  if (b.repAttentionScore !== a.repAttentionScore) return b.repAttentionScore - a.repAttentionScore
  return b.decision.priorityScore - a.decision.priorityScore
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
): BuildQueueResult {
  const now = new Date()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const leadWeights = options?.leadWeights
  const sequenceStatusMap = options?.sequenceStatusMap ?? {}
  const takeoverSignalsByCustomer = options?.takeoverSignalsByCustomer ?? {}

  const followUpTasks = tasks.filter(a =>
    a.type === 'email_followup' || a.type === 'sms_followup' ||
    (a.type === 'email' && a.sequence_day != null) ||
    (a.type === 'sms' && a.sequence_day != null),
  )

  const overdueFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)

  const rawItems: Array<{ type: QueueItemType; data: Activity | VoiceCall; overdueHours?: number; dueSoonHours?: number }> = [
    ...newLeads.map(data => ({ type: 'new_lead' as const, data })),
    ...vehicleMatches.map(data => ({ type: 'vehicle_match' as const, data })),
    ...apptRequests.map(data => ({ type: 'appt_request' as const, data })),
    ...voiceLeads.map(data => ({ type: 'voice_lead' as const, data })),
    ...overdueFollowUps.map(data => ({
      type: 'overdue_followup' as const,
      data,
      overdueHours: data.due_at ? (now.getTime() - new Date(data.due_at).getTime()) / 3_600_000 : 0,
    })),
    ...todayFollowUps.map(data => ({
      type: 'today_followup' as const,
      data,
      dueSoonHours: data.due_at ? Math.max(0, (new Date(data.due_at).getTime() - now.getTime()) / 3_600_000) : 0,
    })),
    ...waiting.map(data => ({
      type: respondedCustomerIds.includes(data.customer_id ?? '') ? 'waiting_responded' as const : 'waiting' as const,
      data,
    })),
  ]

  const items = rawItems.map(({ type, data, overdueHours, dueSoonHours }) => {
    const customerId =
      'customer_id' in data ? data.customer_id ?? undefined : data.customer?.id ?? undefined
    const hasResponded = respondedCustomerIds.includes(customerId ?? '')
    const hasActiveSequence = !!(customerId && sequenceStatusMap[customerId]?.status === 'active')
    const takeoverSignal = customerId ? takeoverSignalsByCustomer[customerId] ?? null : null
    const decision = decisionForItem({
      type,
      data,
      now,
      hasResponded,
      overdueHours,
      dueSoonHours,
      leadWeights,
    })
    const section = sectionAssignment({
      itemType: type,
      data,
      hasResponded,
      hasActiveSequence,
      takeoverSignal,
      decision,
    })

    const queueItem: QueueItem = {
      key: `${type}-${data.id}`,
      type,
      customerId,
      data,
      decision,
      section,
      repAttentionScore: 0,
      hasResponded,
      hasActiveSequence,
      takeoverSignal,
    }

    const withReason = addLowRoiReason(queueItem)
    return {
      ...withReason,
      repAttentionScore: computeRepAttentionScore(withReason),
    }
  }).sort(compareQueueItems)

  const counts = {
    replied: 0,
    human_now: 0,
    ai_handling: 0,
    follow_up_later: 0,
    low_roi: 0,
  } satisfies Record<TodaySection, number>

  for (const item of items) counts[item.section]++

  return { items, counts }
}
