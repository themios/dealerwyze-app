'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'

import { Activity, VoiceCall, type Customer } from '@/types'
import type { SequenceStatus } from '@/components/leads/NewLeadCard'
import { createClient } from '@/lib/supabase/client'
import { shouldShowAddressedActivity } from '@/lib/utils'
import {
  buildQueue,
  TODAY_SECTION_LABELS,
  type QueueItem,
  type TodaySection as TodaySectionKey,
} from '@/lib/today/queueSort'
import TaskItem from '@/components/today/TaskItem'
import WaitingItem from '@/components/today/WaitingItem'
import AfterCallModal from '@/components/call/AfterCallModal'
import { usePendingCall } from '@/components/call/usePendingCall'
import NewLeadCard from '@/components/leads/NewLeadCard'
import VoiceLeadCard from '@/components/leads/VoiceLeadCard'
import VehicleMatchCard from '@/components/leads/VehicleMatchCard'
import EmailFollowUpItem from '@/components/leads/EmailFollowUpItem'
import AppointmentRequestCard from '@/components/today/AppointmentRequestCard'
import UpcomingAppointmentsList, { type UpcomingAppointmentItem } from '@/components/appointments/UpcomingAppointmentsList'
import type { AtRiskLeadItem } from '@/lib/today/atRisk'
import TodaySummaryStrip from '@/components/today/TodaySummaryStrip'
import TodayFilterChips, { type TodayFilter } from '@/components/today/TodayFilterChips'
import TodaySection from '@/components/today/TodaySection'
import TodayBulkBar from '@/components/today/TodayBulkBar'
import FocusSession from '@/components/today/FocusSession'
import type { TakeoverSignal } from '@/lib/today/takeoverDetector'

const MOTIVATIONAL_MESSAGES = [
  'Every call could be your next deal.',
  'Speed wins. Reply first, earn the sale.',
  'Follow up today. Win tomorrow.',
  'Treat every lead like your best customer.',
  'Your next sale starts with your next call.',
  'Consistency beats talent. Show up.',
  'Ask one more question. Find the real need.',
  'Happy customers send you referrals.',
  'Listen more. Close more.',
  'Your attitude sets the tone.',
  'One extra call can change your month.',
  'Build trust first. Sales follow.',
  'Yes or no - not maybe. Follow up.',
  'Know your inventory. Confidence closes.',
  'A good deal for them is good for you.',
  'Speed to lead is your edge.',
  'Every objection is a question in disguise.',
  'Your reputation is built one deal at a time.',
  'Solve the problem. The rest follows.',
  'Follow up now. Not later.',
  'Small courtesies win big loyalty.',
  'Names matter. Use them.',
  'Make buying effortless. Earn referrals.',
  'Clean lot. Warm greeting. Nothing beats it.',
  'Be the dealer people brag about.',
  'Set goals in the morning. Execute all day.',
  'Honest beats polished. Every time.',
  'Know your numbers. Own your results.',
  'Energy is contagious. Bring yours.',
  'Great service is your best ad.',
]

const FILTER_ALLOWLIST = new Set<TodayFilter>([
  'hot',
  'warm',
  'repeat',
  'appointment',
  'phone',
  'silent7',
  'no_automation',
])

const SECTION_ORDER: TodaySectionKey[] = [
  'replied',
  'human_now',
  'ai_handling',
  'follow_up_later',
  'low_roi',
]

type TodayAction = 'park' | 'trust_sequence' | 'low_roi' | 'take_over' | 'work_now' | 'archive' | 'restart'
type BulkAction = 'park' | 'trust_sequence' | 'archive'

interface TodayContentProps {
  initialNewLeads: Activity[]
  initialTasks: Activity[]
  initialWaiting: Activity[]
  initialApptRequests: Activity[]
  initialVoiceLeads: VoiceCall[]
  initialVehicleMatches?: Activity[]
  upcomingAppointments?: UpcomingAppointmentItem[]
  businessName?: string
  respondedCustomerIds?: string[]
  sequenceStatusMap?: Record<string, SequenceStatus>
  initialTakeoverSignals?: Record<string, TakeoverSignal | null>
  leadWeights?: { hotBoost?: number; warmBoost?: number }
  atRiskItems?: AtRiskLeadItem[]
  initialFocusN?: number | null
}

function parseFilters(raw: string | null): TodayFilter[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(value => value.trim())
    .filter((value): value is TodayFilter => FILTER_ALLOWLIST.has(value as TodayFilter))
}

function nextParkIso(): string {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(8, 0, 0, 0)
  return next.toISOString()
}

function getCustomer(item: QueueItem): Partial<Customer> | null {
  if ('customer' in item.data && item.data.customer) return item.data.customer as Partial<Customer>
  return null
}

function getActivity(item: QueueItem): Activity | null {
  return 'from_number' in item.data ? null : item.data
}

function getActivityId(item: QueueItem): string | null {
  return getActivity(item)?.id ?? null
}

function formatNextStep(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function activitySupportsSelection(item: QueueItem): boolean {
  return getActivity(item) != null
}

function itemMatchesFilter(item: QueueItem, filter: TodayFilter): boolean {
  const customer = getCustomer(item)
  const intentBadge = item.decision.intentTierBadge
  switch (filter) {
    case 'hot':
      return intentBadge === 'HOT'
    case 'warm':
      return intentBadge === 'WARM'
    case 'repeat':
      return !!customer?.repeat_lead || (customer?.prior_purchase_count ?? 0) > 0
    case 'appointment':
      return item.type === 'appt_request' || item.takeoverSignal?.trigger === 'appointment' || item.takeoverSignal?.trigger === 'coming_today'
    case 'phone':
      return !!customer?.primary_phone && !customer?.email
    case 'silent7': {
      const lastInboundAt = customer?.last_inbound_at
      if (!lastInboundAt) return true
      return Date.now() - new Date(lastInboundAt).getTime() >= 7 * 86_400_000
    }
    case 'no_automation':
      return !item.hasActiveSequence
    default:
      return true
  }
}

function groupAiHandling(items: QueueItem[], sequenceStatusMap: Record<string, SequenceStatus>) {
  const grouped = new Map<string, { key: string; label: string; count: number; nextStep: string | null; reasons: string[] }>()
  for (const item of items) {
    const customerId = item.customerId ?? ''
    const sequence = customerId ? sequenceStatusMap[customerId] : null
    const label = sequence?.sequence_name?.trim() || 'Autopilot'
    const existing = grouped.get(label)
    const nextStepDue = sequence?.next_step_due ?? null
    if (existing) {
      existing.count += 1
      if (!existing.nextStep || (nextStepDue && new Date(nextStepDue).getTime() < new Date(existing.nextStep).getTime())) {
        existing.nextStep = nextStepDue
      }
      if (existing.reasons.length < 3) {
        for (const reason of item.decision.reasons) {
          if (!existing.reasons.includes(reason) && existing.reasons.length < 3) existing.reasons.push(reason)
        }
      }
      continue
    }
    grouped.set(label, {
      key: label,
      label,
      count: 1,
      nextStep: nextStepDue,
      reasons: item.decision.reasons.slice(0, 3),
    })
  }
  return Array.from(grouped.values()).sort((a, b) => {
    if (!a.nextStep && !b.nextStep) return a.label.localeCompare(b.label)
    if (!a.nextStep) return 1
    if (!b.nextStep) return -1
    return new Date(a.nextStep).getTime() - new Date(b.nextStep).getTime()
  })
}

function patchActivityState(activity: Activity, action: TodayAction): Activity | null {
  switch (action) {
    case 'park':
      return { ...activity, today_section_override: 'follow_up_later', today_park_until: nextParkIso() }
    case 'trust_sequence':
      return { ...activity, today_section_override: 'ai_handling', today_park_until: null, snoozed_until: undefined }
    case 'low_roi':
      return { ...activity, today_section_override: 'low_roi', today_park_until: null }
    case 'take_over':
      return { ...activity, today_section_override: 'human_now', today_park_until: null }
    case 'work_now':
    case 'restart':
      return { ...activity, today_section_override: null, today_park_until: null, snoozed_until: undefined }
    case 'archive':
      return null
  }
}

function applyActionToActivityArray(items: Activity[], ids: Set<string>, action: TodayAction): Activity[] {
  const next: Activity[] = []
  for (const item of items) {
    if (!ids.has(item.id)) {
      next.push(item)
      continue
    }
    const patched = patchActivityState(item, action)
    if (patched) next.push(patched)
  }
  return next
}

function countFilters(items: QueueItem[]): Record<TodayFilter, number> {
  return {
    hot: items.filter(item => itemMatchesFilter(item, 'hot')).length,
    warm: items.filter(item => itemMatchesFilter(item, 'warm')).length,
    repeat: items.filter(item => itemMatchesFilter(item, 'repeat')).length,
    appointment: items.filter(item => itemMatchesFilter(item, 'appointment')).length,
    phone: items.filter(item => itemMatchesFilter(item, 'phone')).length,
    silent7: items.filter(item => itemMatchesFilter(item, 'silent7')).length,
    no_automation: items.filter(item => itemMatchesFilter(item, 'no_automation')).length,
  }
}

export default function TodayContent({
  initialNewLeads,
  initialTasks,
  initialWaiting,
  initialApptRequests,
  initialVoiceLeads,
  initialVehicleMatches = [],
  upcomingAppointments = [],
  respondedCustomerIds = [],
  sequenceStatusMap: initialSequenceStatusMap = {},
  initialTakeoverSignals = {},
  leadWeights,
  atRiskItems = [],
  initialFocusN = null,
}: TodayContentProps) {
  const [newLeads, setNewLeads] = useState<Activity[]>(initialNewLeads)
  const [tasks, setTasks] = useState<Activity[]>(initialTasks)
  const [waiting, setWaiting] = useState<Activity[]>(initialWaiting)
  const [apptRequests, setApptRequests] = useState<Activity[]>(initialApptRequests)
  const [voiceLeads, setVoiceLeads] = useState<VoiceCall[]>(initialVoiceLeads)
  const [vehicleMatches, setVehicleMatches] = useState<Activity[]>(initialVehicleMatches)
  const [responded, setResponded] = useState<string[]>(respondedCustomerIds)
  const [sequenceState, setSequenceState] = useState<Record<string, SequenceStatus>>(initialSequenceStatusMap)
  const [takeoverSignals, setTakeoverSignals] = useState<Record<string, TakeoverSignal | null>>(initialTakeoverSignals)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [focusOpen, setFocusOpen] = useState(initialFocusN != null)
  const [focusCompletedKeys, setFocusCompletedKeys] = useState<string[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const [motivationalMsg, setMotivationalMsg] = useState('')
  const dismissedIds = useRef<Set<string>>(new Set())
  const { pendingCall, modalOpen, dismissModal } = usePendingCall()
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeFilters, setActiveFilters] = useState<TodayFilter[]>(() => parseFilters(searchParams.get('filter')))

  useEffect(() => {
    const now = new Date()
    setDateLabel(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    setMotivationalMsg(MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length])
  }, [])

  useEffect(() => {
    setActiveFilters(parseFilters(searchParams.get('filter')))
  }, [searchParams])

  function playLeadSound() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const notes = [880, 1320]
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        const t = ctx.currentTime + index * 0.18
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.35, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        osc.start(t)
        osc.stop(t + 0.35)
      })
      setTimeout(() => void ctx.close(), 1200)
    } catch {
      return
    }
  }

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  const refresh = useCallback(async () => {
    const now = new Date().toISOString()
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const [
      { data: leads },
      { data: taskRows },
      { data: waitingRows },
      { data: appts },
      { data: voices },
      { data: inbound },
      { data: vMatches },
      { data: seqEnrollments },
    ] = await Promise.all([
      supabase
        .from('activities')
        .select(`*, customer:customers(
          id, name, primary_phone, email, archived, sms_opt_out, unsubscribe_email, unsubscribe_sms,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        )`)
        .eq('type', 'email')
        .eq('direction', 'inbound')
        .eq('outcome', 'pending')
        .is('completed_at', null)
        .is('addressed_at', null)
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select(`*, customer:customers(
          id, name, primary_phone, email, archived,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        )`)
        .in('type', ['task', 'appointment', 'call', 'sms', 'email', 'email_followup', 'sms_followup'])
        .is('completed_at', null)
        .not('direction', 'eq', 'inbound')
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .lte('due_at', todayEnd.toISOString())
        .not('due_at', 'is', null)
        .order('priority', { ascending: false })
        .order('due_at', { ascending: true }),
      supabase
        .from('activities')
        .select(`*, customer:customers(
          id, name, primary_phone, email, archived, sms_opt_out,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        )`)
        .eq('direction', 'outbound')
        .in('type', ['call', 'sms', 'email'])
        .not('outcome', 'eq', 'pending')
        .lt('created_at', yesterday)
        .is('completed_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select(`*, customer:customers(
          id, name, primary_phone, archived,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        )`)
        .eq('type', 'appointment')
        .eq('direction', 'inbound')
        .eq('outcome', 'pending')
        .is('completed_at', null)
        .is('addressed_at', null)
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('voice_calls')
        .select(`*, customer:customers(
          id, name, primary_phone,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        ), linked_task:tasks(id, status)`)
        .eq('status', 'completed')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select('customer_id')
        .in('type', ['sms', 'email'])
        .eq('direction', 'inbound')
        .gte('created_at', last48h)
        .not('customer_id', 'is', null),
      supabase
        .from('activities')
        .select(`*, customer:customers(
          id, name, primary_phone, email, archived,
          lead_intent_score, lead_intent_tier, lead_intent_summary, lead_intent_flags,
          lead_intent_manual_tier, lead_intent_manual_expires_at, lead_intent_score_error,
          lead_intent_next_action, repeat_lead, avg_reply_speed_minutes, inbound_message_count, prior_purchase_count,
          last_inbound_at, last_outbound_at
        ), vehicle:vehicles(id, year, make, model, demand_signal, lead_count_30d)`)
        .eq('type', 'vehicle_match')
        .eq('direction', 'inbound')
        .eq('outcome', 'pending')
        .is('completed_at', null)
        .is('addressed_at', null)
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_sequences')
        .select('id, customer_id, status, sequence_id, sequences!inner(name, channel)')
        .in('status', ['active', 'paused']),
    ])

    const dismissed = dismissedIds.current
    const todayRef = new Date()
    const waitingTouchCounts = new Map<string, number>()
    for (const row of waitingRows ?? []) {
      if (!row.customer_id) continue
      waitingTouchCounts.set(row.customer_id, (waitingTouchCounts.get(row.customer_id) ?? 0) + 1)
    }

    const seenCustomers = new Set<string>()
    const dedupedWaiting = (waitingRows || []).flatMap(activity => {
      if (dismissed.has(activity.id)) return []
      if (!activity.customer_id || seenCustomers.has(activity.customer_id)) return []
      const customer = (activity as { customer?: { archived?: boolean | null } | null }).customer
      if (customer?.archived || !shouldShowAddressedActivity(activity, todayRef)) return []
      seenCustomers.add(activity.customer_id)
      return [{
        ...activity,
        outbound_touch_count: waitingTouchCounts.get(activity.customer_id) ?? 0,
      }]
    })

    const safeLeads = (leads || []).filter(
      activity =>
        !dismissed.has(activity.id) &&
        activity.customer != null &&
        !(activity.customer as { archived?: boolean | null }).archived &&
        shouldShowAddressedActivity(activity, todayRef),
    )

    const tasksFiltered = (taskRows || []).filter(activity => {
      if (dismissed.has(activity.id)) return false
      const customer = (activity as { customer?: { archived?: boolean | null } | null }).customer
      if (customer?.archived) return false
      return shouldShowAddressedActivity(activity, todayRef)
    })

    const apptsFiltered = (appts || []).filter(
      activity =>
        !dismissed.has(activity.id) &&
        activity.customer != null &&
        !(activity.customer as { archived?: boolean | null }).archived &&
        shouldShowAddressedActivity(activity, todayRef),
    )

    const activeVoices = (voices || []).filter(
      (voice: { task_id?: string | null; linked_task?: { status: string } | null }) =>
        !voice.task_id || voice.linked_task?.status !== 'done',
    )

    const respondedIds = [...new Set((inbound || []).map(row => row.customer_id as string))]
    const matchesFiltered = (vMatches || []).filter(
      activity =>
        !dismissed.has(activity.id) &&
        activity.customer != null &&
        !(activity.customer as { archived?: boolean | null }).archived &&
        shouldShowAddressedActivity(activity, todayRef),
    )

    const nextSequenceState: Record<string, SequenceStatus> = {}
    for (const enrollment of seqEnrollments ?? []) {
      const rawSequence = Array.isArray(enrollment.sequences) ? enrollment.sequences[0] : enrollment.sequences
      nextSequenceState[enrollment.customer_id] = {
        id: enrollment.id,
        status: enrollment.status as SequenceStatus['status'],
        sequence_name: rawSequence?.name ?? '',
      }
    }

    const sequenceCustomerIds = Object.keys(nextSequenceState)
    if (sequenceCustomerIds.length > 0) {
      const [{ data: pendingSteps }, { data: inboundBodies }] = await Promise.all([
        supabase
          .from('activities')
          .select('customer_id, due_at, customer_sequence_id')
          .in('customer_id', sequenceCustomerIds)
          .is('completed_at', null)
          .not('customer_sequence_id', 'is', null)
          .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
          .order('due_at', { ascending: true }),
        supabase
          .from('activities')
          .select('customer_id, body, created_at')
          .eq('direction', 'inbound')
          .in('type', ['sms', 'email'])
          .in('customer_id', sequenceCustomerIds)
          .order('created_at', { ascending: false }),
      ])

      for (const step of pendingSteps ?? []) {
        const entry = nextSequenceState[step.customer_id]
        if (entry && !entry.next_step_due) entry.next_step_due = step.due_at
      }

      const detector = await import('@/lib/today/takeoverDetector')
      const seenInbound = new Set<string>()
      const nextSignals: Record<string, TakeoverSignal | null> = {}
      for (const row of inboundBodies ?? []) {
        if (!row.customer_id || seenInbound.has(row.customer_id)) continue
        seenInbound.add(row.customer_id)
        nextSignals[row.customer_id] = detector.detectTakeoverSignal(row.body ?? '')
      }
      setTakeoverSignals(nextSignals)
    } else {
      setTakeoverSignals({})
    }

    setNewLeads(safeLeads)
    setTasks(tasksFiltered)
    setWaiting(dedupedWaiting as Activity[])
    setApptRequests(apptsFiltered)
    setVoiceLeads(activeVoices)
    setResponded(respondedIds)
    setVehicleMatches(matchesFiltered)
    setSequenceState(nextSequenceState)
  }, [supabase])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
        void refresh()
      }
    }
    const handleFocus = () => { void refresh() }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refresh, router])

  useEffect(() => {
    const channel = supabase
      .channel('new-leads-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, payload => {
        const row = payload.new as Activity
        if (row.type === 'email' && row.direction === 'inbound' && row.outcome === 'pending') {
          playLeadSound()
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('New lead just came in', {
              body: 'Tap to open DealerWyze and respond now.',
              icon: '/favicon.ico',
              tag: 'new-lead',
            })
          }
        }
        void refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'activities' }, payload => {
        const row = payload.new as Activity
        if (row.addressed_at || row.completed_at) void refresh()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, refresh])

  const queueResult = useMemo(
    () => buildQueue(newLeads, apptRequests, voiceLeads, tasks, waiting, responded, vehicleMatches, {
      leadWeights,
      sequenceStatusMap: sequenceState,
      takeoverSignalsByCustomer: takeoverSignals,
    }),
    [newLeads, apptRequests, voiceLeads, tasks, waiting, responded, vehicleMatches, leadWeights, sequenceState, takeoverSignals],
  )

  const filterCounts = useMemo(() => countFilters(queueResult.items), [queueResult.items])
  const filteredItems = useMemo(() => {
    if (activeFilters.length === 0) return queueResult.items
    return queueResult.items.filter(item => activeFilters.every(filter => itemMatchesFilter(item, filter)))
  }, [queueResult.items, activeFilters])

  const filteredCounts = useMemo(() => {
    const counts: Record<TodaySectionKey, number> = {
      replied: 0,
      human_now: 0,
      ai_handling: 0,
      follow_up_later: 0,
      low_roi: 0,
    }
    for (const item of filteredItems) counts[item.section]++
    return counts
  }, [filteredItems])

  const sectionItems = useMemo(() => {
    return SECTION_ORDER.reduce<Record<TodaySectionKey, QueueItem[]>>((acc, section) => {
      acc[section] = filteredItems.filter(item => item.section === section)
      return acc
    }, {
      replied: [],
      human_now: [],
      ai_handling: [],
      follow_up_later: [],
      low_roi: [],
    })
  }, [filteredItems])

  const focusItems = useMemo(() => {
    const base = filteredItems.filter(item => item.section === 'replied' || item.section === 'human_now')
    const n = initialFocusN ?? 5
    return base.slice(0, n)
  }, [filteredItems, initialFocusN])

  const aiGroups = useMemo(() => groupAiHandling(sectionItems.ai_handling, sequenceState), [sectionItems.ai_handling, sequenceState])

  const updateFilterUrl = useCallback((filters: TodayFilter[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (filters.length === 0) params.delete('filter')
    else params.set('filter', filters.join(','))
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const toggleFilter = useCallback((filter: TodayFilter) => {
    setActiveFilters(current => {
      const next = current.includes(filter)
        ? current.filter(value => value !== filter)
        : [...current, filter]
      updateFilterUrl(next)
      return next
    })
  }, [updateFilterUrl])

  const toggleSelected = useCallback((activityId: string) => {
    setSelectedIds(current => (
      current.includes(activityId)
        ? current.filter(id => id !== activityId)
        : current.length >= 50
          ? current
          : [...current, activityId]
    ))
  }, [])

  const restoreSnapshot = useCallback((snapshot: {
    newLeads: Activity[]
    tasks: Activity[]
    waiting: Activity[]
    apptRequests: Activity[]
    voiceLeads: VoiceCall[]
    vehicleMatches: Activity[]
    responded: string[]
    sequenceState: Record<string, SequenceStatus>
    takeoverSignals: Record<string, TakeoverSignal | null>
    selectedIds: string[]
  }) => {
    setNewLeads(snapshot.newLeads)
    setTasks(snapshot.tasks)
    setWaiting(snapshot.waiting)
    setApptRequests(snapshot.apptRequests)
    setVoiceLeads(snapshot.voiceLeads)
    setVehicleMatches(snapshot.vehicleMatches)
    setResponded(snapshot.responded)
    setSequenceState(snapshot.sequenceState)
    setTakeoverSignals(snapshot.takeoverSignals)
    setSelectedIds(snapshot.selectedIds)
  }, [])

  const applyLocalAction = useCallback((activityIds: string[], action: TodayAction) => {
    const ids = new Set(activityIds)
    setNewLeads(current => applyActionToActivityArray(current, ids, action))
    setTasks(current => applyActionToActivityArray(current, ids, action))
    setWaiting(current => applyActionToActivityArray(current, ids, action))
    setApptRequests(current => applyActionToActivityArray(current, ids, action))
    setVehicleMatches(current => applyActionToActivityArray(current, ids, action))
  }, [])

  const applySequenceMutation = useCallback((items: QueueItem[], action: TodayAction) => {
    if (action !== 'take_over' && action !== 'trust_sequence' && action !== 'restart') return
    setSequenceState(current => {
      const next = { ...current }
      for (const item of items) {
        if (!item.customerId || !next[item.customerId]) continue
        if (action === 'take_over') next[item.customerId] = { ...next[item.customerId], status: 'paused' }
        if (action === 'trust_sequence' || action === 'restart') next[item.customerId] = { ...next[item.customerId], status: 'active' }
      }
      return next
    })
  }, [])

  const runSingleAction = useCallback(async (item: QueueItem, action: TodayAction) => {
    const activityId = getActivityId(item)
    if (!activityId) return
    setActionError(null)
    const snapshot = {
      newLeads,
      tasks,
      waiting,
      apptRequests,
      voiceLeads,
      vehicleMatches,
      responded,
      sequenceState,
      takeoverSignals,
      selectedIds,
    }

    applyLocalAction([activityId], action)
    applySequenceMutation([item], action)
    setSelectedIds(current => current.filter(id => id !== activityId))
    setFocusCompletedKeys(current => current.includes(item.key) ? current : [...current, item.key])

    const response = await fetch('/api/today/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, action }),
    })

    if (!response.ok) {
      restoreSnapshot(snapshot)
      const json = await response.json().catch(() => ({})) as { error?: string }
      setActionError(json.error ?? 'Unable to update Today right now.')
      return
    }

    if (action === 'archive') dismissedIds.current.add(activityId)
  }, [
    newLeads,
    tasks,
    waiting,
    apptRequests,
    voiceLeads,
    vehicleMatches,
    responded,
    sequenceState,
    takeoverSignals,
    selectedIds,
    applyLocalAction,
    applySequenceMutation,
    restoreSnapshot,
  ])

  const runBulkAction = useCallback(async (
    action: BulkAction,
    ids = selectedIds,
    opts?: { archiveReason?: 'ghost' | 'manual' | 'post_last_ditch' | 'bulk' },
  ) => {
    if (ids.length === 0) return
    if (action === 'archive' && !window.confirm(`Archive ${ids.length} leads from Today?`)) return
    setActionError(null)

    const itemsById = new Map(filteredItems.flatMap(item => {
      const activityId = getActivityId(item)
      return activityId ? [[activityId, item] as const] : []
    }))
    const touchedItems = ids.map(id => itemsById.get(id)).filter(Boolean) as QueueItem[]
    const snapshot = {
      newLeads,
      tasks,
      waiting,
      apptRequests,
      voiceLeads,
      vehicleMatches,
      responded,
      sequenceState,
      takeoverSignals,
      selectedIds,
    }

    const localAction: TodayAction = action
    applyLocalAction(ids, localAction)
    applySequenceMutation(touchedItems, localAction)
    setSelectedIds([])
    setFocusCompletedKeys(current => {
      const next = new Set(current)
      for (const item of touchedItems) next.add(item.key)
      return Array.from(next)
    })

    const body = {
      activityIds: ids,
      action,
      ...(opts?.archiveReason ? { archiveReason: opts.archiveReason } : {}),
    }

    const response = await fetch('/api/today/bulk-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      restoreSnapshot(snapshot)
      const json = await response.json().catch(() => ({})) as { error?: string }
      setActionError(json.error ?? 'Unable to update those leads right now.')
      return
    }

    if (action === 'archive') {
      ids.forEach(id => dismissedIds.current.add(id))
    }
  }, [
    selectedIds,
    filteredItems,
    newLeads,
    tasks,
    waiting,
    apptRequests,
    voiceLeads,
    vehicleMatches,
    responded,
    sequenceState,
    takeoverSignals,
    applyLocalAction,
    applySequenceMutation,
    restoreSnapshot,
  ])

  const jumpToSection = useCallback((section: TodaySectionKey) => {
    document.getElementById(`today-section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sectionActions = useCallback((item: QueueItem): Array<{ label: string; action: TodayAction; tone?: 'primary' | 'muted' | 'danger' }> => {
    switch (item.section) {
      case 'replied':
        return [
          { label: 'Trust Sequence', action: 'trust_sequence' },
          { label: 'Park', action: 'park', tone: 'muted' },
        ]
      case 'human_now':
        return [
          { label: 'Trust Sequence', action: 'trust_sequence' },
          { label: 'Park', action: 'park', tone: 'muted' },
        ]
      case 'ai_handling':
        return [
          { label: 'Take Over', action: 'take_over', tone: 'primary' },
          { label: 'Park', action: 'park', tone: 'muted' },
        ]
      case 'follow_up_later':
        return [
          { label: 'Work Now', action: 'work_now', tone: 'primary' },
          { label: 'Archive', action: 'archive', tone: 'danger' },
        ]
      case 'low_roi':
        return [
          { label: 'Archive', action: 'archive', tone: 'danger' },
          { label: 'Restart', action: 'restart', tone: 'muted' },
        ]
    }
  }, [])

  const renderCard = useCallback((item: QueueItem): ReactNode => {
    const activityId = getActivityId(item)
    const customerId = item.customerId ?? ''
    const sequenceStatus = customerId ? sequenceState[customerId] ?? null : null
    const customer = getCustomer(item)
    const meta = (
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        {activityId && activitySupportsSelection(item) && (
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={selectedIds.includes(activityId)}
              onChange={() => toggleSelected(activityId)}
              aria-label={`Select ${customer?.name ?? 'lead'} for bulk action`}
              className="h-4 w-4 rounded border-border"
            />
            Select
          </label>
        )}
        {sequenceStatus?.status === 'active' && (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
            AI working{sequenceStatus.sequence_name ? ` · ${sequenceStatus.sequence_name}` : ''}{sequenceStatus.next_step_due ? ` · next ${formatNextStep(sequenceStatus.next_step_due)}` : ''}
          </span>
        )}
        {item.takeoverSignal && (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
            {item.takeoverSignal.reason}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{item.decision.reasons[0]}</span>
      </div>
    )

    const actions = activityId ? (
      <div className="mt-2 flex flex-wrap gap-2 px-1">
        {sectionActions(item).map(button => (
          <button
            key={`${item.key}-${button.action}`}
            type="button"
            aria-label={`${button.label} for ${customer?.name ?? 'lead'}`}
            onClick={() => void runSingleAction(item, button.action)}
            className={
              button.tone === 'danger'
                ? 'rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground'
                : button.tone === 'primary'
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground'
            }
          >
            {button.label}
          </button>
        ))}
      </div>
    ) : null

    let body: ReactNode
    if (item.type === 'new_lead') {
      const actId = (item.data as Activity).id
      body = (
        <NewLeadCard
          activity={item.data as Parameters<typeof NewLeadCard>[0]['activity']}
          onUpdate={refresh}
          onAddressed={() => {
            dismissedIds.current.add(actId)
            setNewLeads(current => current.filter(activity => activity.id !== actId))
            setFocusCompletedKeys(current => current.includes(item.key) ? current : [...current, item.key])
          }}
          hasResponded={item.hasResponded}
          sequenceStatus={sequenceStatus}
          queueReasons={item.decision.reasons}
          intentTierBadge={item.decision.intentTierBadge}
          nextActionLabel={item.decision.nextActionLabel}
        />
      )
    } else if (item.type === 'vehicle_match') {
      body = (
        <VehicleMatchCard
          activity={item.data as Parameters<typeof VehicleMatchCard>[0]['activity']}
          onUpdate={refresh}
        />
      )
    } else if (item.type === 'appt_request') {
      body = (
        <AppointmentRequestCard
          activity={item.data as Parameters<typeof AppointmentRequestCard>[0]['activity']}
          onUpdate={refresh}
        />
      )
    } else if (item.type === 'voice_lead') {
      body = <VoiceLeadCard call={item.data as VoiceCall} onUpdate={refresh} />
    } else if (item.type === 'overdue_followup' || item.type === 'today_followup') {
      body = (
        <EmailFollowUpItem
          activity={item.data as Parameters<typeof EmailFollowUpItem>[0]['activity']}
          onUpdate={refresh}
          hasResponded={item.hasResponded}
        />
      )
    } else {
      body = (
        <WaitingItem
          activity={item.data as Activity}
          onUpdate={refresh}
          hasResponded={item.hasResponded}
          queueReasons={item.decision.reasons}
          intentTierBadge={item.decision.intentTierBadge}
          nextActionLabel={item.decision.nextActionLabel}
          sequenceStatus={sequenceStatus}
        />
      )
    }

    return (
      <motion.div
        key={item.key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24 }}
      >
        {meta}
        {body}
        {actions}
      </motion.div>
    )
  }, [refresh, runSingleAction, sectionActions, selectedIds, sequenceState, toggleSelected])

  const queueLength = filteredItems.length
  const lowRoiIds = sectionItems.low_roi.map(getActivityId).filter(Boolean) as string[]

  return (
    <div className="page-enter">
      <div className="gradient-sunset flex items-center gap-2.5 px-4 py-2 text-white">
        <Image src="/logo-mark.png" alt="DealerWyze" width={28} height={28} className="rounded-md flex-shrink-0 opacity-90" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium opacity-80" suppressHydrationWarning>
          {dateLabel || '…'}
        </span>
        {queueLength > 0 && (
          <span className="rounded-full bg-[#F07018] px-2 py-0.5 text-xs font-semibold text-white">
            {queueLength} active
          </span>
        )}
      </div>

      <div className="space-y-6 px-4 py-2">
        <UpcomingAppointmentsList
          title="Today & Tomorrow Appointments"
          appointments={upcomingAppointments}
        />

        {atRiskItems.length > 0 && (
          <section className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">At risk — stale leads</p>
            <p className="text-xs text-muted-foreground">Pending inbound email with no dealer response in 48+ hours.</p>
            <ul className="space-y-1.5">
              {atRiskItems.map(item => (
                <li key={item.activity_id}>
                  <Link href={`/customers/${item.customer_id}?activity=${item.activity_id}`} className="text-sm font-medium text-foreground hover:underline">
                    {item.customer_name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{item.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today Command Center</p>
              <h2 className="text-lg font-semibold">Work the right leads, ignore the noise</h2>
            </div>
            <button
              type="button"
              onClick={() => setFocusOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <Sparkles className="h-4 w-4" />
              Focus Session
            </button>
          </div>

          <TodaySummaryStrip counts={filteredCounts} onJump={jumpToSection} />
          <TodayFilterChips active={activeFilters} counts={filterCounts} onToggle={toggleFilter} />
          {activeFilters.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {activeFilters.length} filter{activeFilters.length === 1 ? '' : 's'} active.
            </p>
          )}
          {actionError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}
        </div>

        {queueLength === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-1 opacity-30"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            <p className="text-base font-semibold text-foreground">You&apos;re all caught up</p>
            <p className="text-sm">Nothing pending for today.</p>
          </div>
        )}

        {SECTION_ORDER.map(section => (
          <TodaySection
            key={section}
            sectionKey={section}
            title={TODAY_SECTION_LABELS[section]}
            count={filteredCounts[section]}
            defaultOpen={section === 'replied' || section === 'human_now'}
            emptyMessage={
              section === 'ai_handling'
                ? 'Automation has nothing active right now.'
                : section === 'low_roi'
                  ? 'No low-return leads right now.'
                  : 'Nothing in this section right now.'
            }
            headerActions={section === 'low_roi' && lowRoiIds.length > 0 ? (
              <button
                type="button"
                onClick={() => void runBulkAction('archive', lowRoiIds, { archiveReason: 'ghost' })}
                className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
              >
                Archive All Low ROI
              </button>
            ) : undefined}
          >
            {section === 'ai_handling' ? (
              <div className="space-y-2">
                {aiGroups.map(group => (
                  <div key={group.key} className="rounded-xl border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{group.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.count} lead{group.count === 1 ? '' : 's'} covered
                          {group.nextStep ? ` · next touch ${formatNextStep(group.nextStep)}` : ''}
                        </p>
                      </div>
                    </div>
                    {group.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {group.reasons.map(reason => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : section === 'replied' || section === 'human_now' || section === 'follow_up_later' || section === 'low_roi' ? (
              <div className="space-y-3">
                {sectionItems[section].map(item => renderCard(item))}
              </div>
            ) : null}
          </TodaySection>
        ))}

        {tasks.length > 0 && (
          <TodaySection
            sectionKey="manual-tasks"
            title="Manual Tasks"
            count={tasks.length}
            defaultOpen={false}
            emptyMessage="No manual tasks due right now."
          >
            <div className="space-y-2">
              {tasks
                .filter(task => task.type === 'task' || task.type === 'appointment' || task.type === 'call' || task.type === 'sms' || task.type === 'email')
                .slice(0, 10)
                .map(task => (
                  <TaskItem key={task.id} activity={task} onUpdate={refresh} />
                ))}
            </div>
          </TodaySection>
        )}

        {motivationalMsg && (
          <p className="mt-4 pb-2 text-center text-xs italic text-muted-foreground opacity-60" suppressHydrationWarning>
            {motivationalMsg}
          </p>
        )}
      </div>

      <TodayBulkBar
        selectedCount={selectedIds.length}
        onAction={action => void runBulkAction(action)}
        onClear={() => setSelectedIds([])}
      />

      <FocusSession
        open={focusOpen}
        items={focusItems}
        completedKeys={focusCompletedKeys}
        onClose={() => setFocusOpen(false)}
        renderItem={item => renderCard(item)}
      />

      <AfterCallModal open={modalOpen} pendingCall={pendingCall} onDismiss={dismissModal} />
    </div>
  )
}
