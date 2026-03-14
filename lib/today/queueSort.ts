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
  data: Activity | VoiceCall
}

export const TIER_LABELS: Record<number, string> = {
  1: 'New Leads',
  2: 'Missed Calls & Appointments',
  3: 'Overdue',
  4: 'Due Today',
  5: 'Waiting on Customer',
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
    items.push({ key: `lead-${a.id}`, tier: 1, urgencyScore: new Date(a.created_at).getTime(), type: 'new_lead', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 1: Vehicle want-list matches — newest first
  for (const a of vehicleMatches) {
    items.push({ key: `vmatch-${a.id}`, tier: 1, urgencyScore: new Date(a.created_at).getTime(), type: 'vehicle_match', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 2: Appointment requests — oldest first
  for (const a of apptRequests) {
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    items.push({ key: `appt-${a.id}`, tier: 2, urgencyScore: Math.min(ageH, 72), type: 'appt_request', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 2: Voice leads (missed calls) — oldest first
  for (const v of voiceLeads) {
    const ageH = (now.getTime() - new Date((v as unknown as { created_at: string }).created_at ?? 0).getTime()) / 3_600_000
    items.push({ key: `voice-${v.id}`, tier: 2, urgencyScore: Math.min(ageH, 72), type: 'voice_lead', customerId: (v as unknown as { customer?: { id: string } }).customer?.id, data: v })
  }

  // Tier 2: Appointments (scheduled, today)
  for (const a of appointments) {
    items.push({ key: `sched-${a.id}`, tier: 2, urgencyScore: 0, type: 'today_task', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 3: Overdue follow-ups — most overdue first
  for (const a of overdueFollowUps) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    items.push({ key: `ofu-${a.id}`, tier: 3, urgencyScore: overdueH, type: 'overdue_followup', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 3: Overdue tasks — most overdue first
  for (const a of overdueTasks) {
    const overdueH = (now.getTime() - new Date(a.due_at!).getTime()) / 3_600_000
    items.push({ key: `otask-${a.id}`, tier: 3, urgencyScore: overdueH, type: 'overdue_task', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 4: Due today follow-ups — due soonest first
  for (const a of todayFollowUps) {
    items.push({ key: `tfu-${a.id}`, tier: 4, urgencyScore: -(new Date(a.due_at!).getTime()), type: 'today_followup', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 4: Due today tasks — due soonest first
  for (const a of todayTasks) {
    items.push({ key: `ttask-${a.id}`, tier: 4, urgencyScore: -(new Date(a.due_at!).getTime()), type: 'today_task', customerId: a.customer_id ?? undefined, data: a })
  }

  // Tier 5: Waiting — customers who replied surface first, then by age
  for (const a of waiting) {
    const hasResponded = respondedCustomerIds.includes(a.customer_id ?? '')
    const ageH = (now.getTime() - new Date(a.created_at).getTime()) / 3_600_000
    items.push({
      key: `wait-${a.id}`,
      tier: 5,
      urgencyScore: hasResponded ? 9999 : Math.min(ageH, 72),
      type: hasResponded ? 'waiting_responded' : 'waiting',
      customerId: a.customer_id ?? undefined,
      data: a,
    })
  }

  return items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    return b.urgencyScore - a.urgencyScore
  })
}
