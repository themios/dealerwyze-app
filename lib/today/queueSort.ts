import { Activity, VoiceCall } from '@/types'

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
  | 'confirm_appointment'
  | 'send_followup'
  | 'review_reply'
  | 'wait'

export interface QueueDecision {
  priorityScore: number
  winLikelihood: number
  delayRisk: number
  nextBestAction: NextBestAction
  reasons: string[]
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
}): QueueDecision {
  const { tier, type, data, now, hasResponded, overdueHours = 0 } = args
  const hasDueSoon = args.dueSoonHours !== undefined
  const dueSoonHours = args.dueSoonHours ?? 0

  const createdAt = new Date(('created_at' in data ? data.created_at : now.toISOString()))
  const ageMinutes = Math.max(0, (now.getTime() - createdAt.getTime()) / 60_000)
  const freshness = clamp(1 - ageMinutes / 180)
  // delayFromAge rises to 1 over 90 min (was 45 — reduced to avoid over-weighting age vs intent)
  const delayFromAge = clamp(ageMinutes / 90)
  const delayFromOverdue = clamp(overdueHours / 8)
  // delayFromDueSoon only applies to items that actually have a due time
  const delayFromDueSoon = hasDueSoon ? clamp(1 - dueSoonHours / 6) : 0
  const delayRisk = clamp(Math.max(delayFromAge, delayFromOverdue, delayFromDueSoon))

  const text = activityText(data)
  const intent = intentSignal(text)
  const contactability = contactabilitySignal(data)

  // Floor lowered from 0.32 to 0.15 — contactless cold leads should read low
  let winLikelihood = 0.15 + freshness * 0.25 + intent * 0.28 + contactability * 0.20
  if (type === 'voice_lead' || type === 'appt_request' || type === 'vehicle_match') winLikelihood += 0.08
  if (hasResponded) winLikelihood += 0.2
  winLikelihood = clamp(winLikelihood, 0.05, 0.98)

  const tierBase: Record<number, number> = { 1: 500, 2: 420, 3: 340, 4: 260, 5: 180 }
  const priorityScore =
    tierBase[tier] +
    winLikelihood * 200 +
    delayRisk * 140 +
    intent * 130 +     // intent now outweighs delay — a hot lead beats a stale cold one
    contactability * 50 +
    (hasResponded ? 80 : 0)

  const reasons: string[] = []
  if (hasResponded) reasons.push('Customer replied recently')
  if (intent >= 0.5) reasons.push('High-intent buying signals')
  if (delayRisk >= 0.65) reasons.push('Delay risk is high')
  if (freshness >= 0.75 && tier <= 2) reasons.push('Fresh lead momentum')
  if (contactability >= 0.6) reasons.push('Contact channel available')
  if (reasons.length === 0) reasons.push('Standard priority by SLA and activity type')

  return {
    priorityScore: Math.round(priorityScore),
    winLikelihood,
    delayRisk,
    nextBestAction: inferAction(type, data, hasResponded),
    reasons,
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
): QueueItem[] {
  const now = new Date()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const followUpTasks = tasks.filter(a =>
    a.type === 'email_followup' || a.type === 'sms_followup' ||
    (a.type === 'email' && a.sequence_day && a.sequence_day >= 2)
  )
  const regularTasks = tasks.filter(a =>
    !(a.type === 'email_followup' || a.type === 'sms_followup' ||
    (a.type === 'email' && a.sequence_day && a.sequence_day >= 2))
  )
  const appointments = regularTasks.filter(a => a.type === 'appointment')
  const nonApptTasks = regularTasks.filter(a => a.type !== 'appointment')

  const overdueFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayFollowUps   = followUpTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)
  const overdueTasks     = nonApptTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayTasks       = nonApptTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)

  const items: QueueItem[] = []

  // Tier 1: New leads — newest first (freshest lead is hottest, still engaged)
  for (const a of newLeads) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 1, type: 'new_lead', data: a, now, hasResponded })
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

  // Tier 1: Vehicle want-list matches — newest first
  for (const a of vehicleMatches) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 1, type: 'vehicle_match', data: a, now, hasResponded })
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

  // Tier 2: Appointment requests — oldest first
  for (const a of apptRequests) {
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 2, type: 'appt_request', data: a, now, hasResponded })
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

  // Tier 2: Voice leads (missed calls) — oldest first
  for (const v of voiceLeads) {
    const ageH = (now.getTime() - new Date((v as unknown as { created_at: string }).created_at ?? 0).getTime()) / 3_600_000
    const customerId = (v as unknown as { customer?: { id: string } }).customer?.id
    const hasResponded = respondedCustomerIds.includes(customerId ?? '')
    const decision = decisionForItem({ tier: 2, type: 'voice_lead', data: v, now, hasResponded })
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

  // Tier 2: Appointments (scheduled, today)
  for (const a of appointments) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = a.due_at ? Math.max(0, (new Date(a.due_at).getTime() - now.getTime()) / 3_600_000) : 0
    const decision = decisionForItem({ tier: 2, type: 'today_task', data: a, now, hasResponded, dueSoonHours })
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

  // Tier 3: Overdue follow-ups — most overdue first
  for (const a of overdueFollowUps) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 3, type: 'overdue_followup', data: a, now, hasResponded, overdueHours: overdueH })
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

  // Tier 3: Overdue tasks — most overdue first
  for (const a of overdueTasks) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const decision = decisionForItem({ tier: 3, type: 'overdue_task', data: a, now, hasResponded, overdueHours: overdueH })
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

  // Tier 4: Due today follow-ups — due soonest first
  for (const a of todayFollowUps) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = Math.max(0, (new Date(a.due_at!).getTime() - now.getTime()) / 3_600_000)
    const decision = decisionForItem({ tier: 4, type: 'today_followup', data: a, now, hasResponded, dueSoonHours })
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

  // Tier 4: Due today tasks — due soonest first
  for (const a of todayTasks) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const dueSoonHours = Math.max(0, (new Date(a.due_at!).getTime() - now.getTime()) / 3_600_000)
    const decision = decisionForItem({ tier: 4, type: 'today_task', data: a, now, hasResponded, dueSoonHours })
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

  // Tier 5: Waiting — customers who replied surface first, then by age
  for (const a of waiting) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    const type = hasResponded ? 'waiting_responded' : 'waiting'
    const decision = decisionForItem({ tier: 5, type, data: a, now, hasResponded })
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
