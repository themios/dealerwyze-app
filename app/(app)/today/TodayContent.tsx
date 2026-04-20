'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Activity, VoiceCall } from '@/types'
import { SequenceStatus } from '@/components/leads/NewLeadCard'
import { createClient } from '@/lib/supabase/client'
import { shouldShowAddressedActivity } from '@/lib/utils'
import { buildQueue, TIER_LABELS } from '@/lib/today/queueSort'
import TaskItem from '@/components/today/TaskItem'
import WaitingItem from '@/components/today/WaitingItem'
import AfterCallModal from '@/components/call/AfterCallModal'
import { usePendingCall } from '@/components/call/usePendingCall'
import NewLeadCard from '@/components/leads/NewLeadCard'
import VoiceLeadCard from '@/components/leads/VoiceLeadCard'
import VehicleMatchCard from '@/components/leads/VehicleMatchCard'
import EmailFollowUpItem from '@/components/leads/EmailFollowUpItem'
import AppointmentRequestCard from '@/components/today/AppointmentRequestCard'

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


interface TodayContentProps {
  initialNewLeads: Activity[]
  initialTasks: Activity[]
  initialWaiting: Activity[]

  initialApptRequests: Activity[]
  initialVoiceLeads: VoiceCall[]
  initialVehicleMatches?: Activity[]
  businessName?: string
  respondedCustomerIds?: string[]
  sequenceStatusMap?: Record<string, SequenceStatus>
}

export default function TodayContent({ initialNewLeads, initialTasks, initialWaiting, initialApptRequests, initialVoiceLeads, initialVehicleMatches = [], respondedCustomerIds = [], sequenceStatusMap = {} }: TodayContentProps) {
  const [newLeads, setNewLeads] = useState<Activity[]>(initialNewLeads)
  const [tasks, setTasks] = useState<Activity[]>(initialTasks)
  const [waiting, setWaiting] = useState<Activity[]>(initialWaiting)
  const [apptRequests, setApptRequests] = useState<Activity[]>(initialApptRequests)
  const [voiceLeads, setVoiceLeads] = useState<VoiceCall[]>(initialVoiceLeads)
  const [vehicleMatches, setVehicleMatches] = useState<Activity[]>(initialVehicleMatches)
  const [responded, setResponded] = useState<string[]>(respondedCustomerIds)
  // Track locally dismissed activity IDs so refresh() can't un-dismiss them
  const dismissedIds = useRef<Set<string>>(new Set())
  const { pendingCall, modalOpen, dismissModal } = usePendingCall()
  const supabase = createClient()
  const router = useRouter()
  const [dateLabel, setDateLabel] = useState('')
  const [motivationalMsg, setMotivationalMsg] = useState('')
  useEffect(() => {
    const now = new Date()
    setDateLabel(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    setMotivationalMsg(MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length])
  }, [])

  // ── Lead notification sound (synthesized) ───────────────────────────────────
  function playLeadSound() {
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const notes = [880, 1320]
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        const t = ctx.currentTime + i * 0.18
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.35, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        osc.start(t)
        osc.stop(t + 0.35)
      })
      setTimeout(() => ctx.close(), 1200)
    } catch {
      // audio blocked — silent fail
    }
  }

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const refresh = useCallback(async () => {
    const now = new Date().toISOString()
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const [{ data: leads }, { data: t }, { data: w }] = await Promise.all([
      supabase
        .from('activities')
        .select('*, customer:customers(id, name, primary_phone, email, archived)')
        .eq('type', 'email')
        .eq('direction', 'inbound')
        .eq('outcome', 'pending')
        .is('completed_at', null)
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select('*, customer:customers(id, name, primary_phone, email, archived)')
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
        .select('*, customer:customers(id, name, primary_phone, archived)')
        .eq('direction', 'outbound')
        .in('type', ['call', 'sms', 'email'])
        .not('outcome', 'eq', 'pending')
        .lt('created_at', yesterday)
        .is('completed_at', null)
        .order('created_at', { ascending: false }),
    ])

    const seenCustomers = new Set<string>()
    const dedupedWaiting = (w || []).filter(a => {
      if (dismissed.has(a.id)) return false
      if (!a.customer_id || seenCustomers.has(a.customer_id)) return false
      const c = (a as { customer?: { archived?: boolean | null } | null }).customer
      if (c?.archived) return false
      seenCustomers.add(a.customer_id)
      return true
    })

    const todayRef = new Date()
    const dismissed = dismissedIds.current
    const safeLeads = (leads || []).filter(
      a => !dismissed.has(a.id) && a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
    )
    const tasksFiltered = (t || []).filter(a => {
      if (dismissed.has(a.id)) return false
      const c = (a as { customer?: { archived?: boolean | null } | null }).customer
      if (c?.archived) return false
      return shouldShowAddressedActivity(a, todayRef)
    })

    const { data: appts } = await supabase
      .from('activities')
      .select('*, customer:customers(id, name, primary_phone, archived)')
      .eq('type', 'appointment')
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: voices } = await supabase
      .from('voice_calls')
      .select('*, customer:customers(id, name, primary_phone), linked_task:tasks(id, status)')
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })

    const activeVoices = (voices || []).filter(
      (v: { task_id?: string | null; linked_task?: { status: string } | null }) =>
        !v.task_id || v.linked_task?.status !== 'done'
    )

    const apptsFiltered = (appts || []).filter(
      a => !dismissed.has(a.id) && a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
    )

    // Refresh responded customer IDs (inbound sms/email in last 48h)
    const { data: inbound } = await supabase
      .from('activities')
      .select('customer_id')
      .in('type', ['sms', 'email'])
      .eq('direction', 'inbound')
      .gte('created_at', last48h)
      .not('customer_id', 'is', null)

    const respondedIds = [...new Set((inbound || []).map(a => a.customer_id as string))]

    // Refresh vehicle matches
    const { data: vMatches } = await supabase
      .from('activities')
      .select('*, customer:customers(id, name, primary_phone, archived), vehicle:vehicles(id, year, make, model)')
      .eq('type', 'vehicle_match')
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false })
    setVehicleMatches((vMatches || []).filter(
      a => !dismissed.has(a.id) && a.customer != null && !(a.customer as { archived?: boolean | null }).archived && shouldShowAddressedActivity(a, todayRef)
    ))

    setNewLeads(safeLeads)
    setTasks(tasksFiltered)
    setWaiting(dedupedWaiting)
    setApptRequests(apptsFiltered)
    setVoiceLeads(activeVoices)
    setResponded(respondedIds)
  }, [supabase])

  // Re-fetch on every mount — catches the case where the user navigated to a customer page,
  // sent a reply, and came back. The Next.js router cache may serve stale initial props,
  // so we always pull fresh data from Supabase as soon as Today renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [])

  // Re-fetch when the tab regains focus — covers mobile background/foreground and multi-tab usage.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
        refresh()
      }
    }
    const handleFocus = () => { refresh() }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refresh, router])

  // ── Supabase Realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('new-leads-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities' },
        (payload) => {
          const row = payload.new as Activity
          if (row.type === 'email' && row.direction === 'inbound' && row.outcome === 'pending') {
            // New inbound lead — play sound and notify
            playLeadSound()
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('New lead just came in', {
                body: 'Tap to open DealerWyze and respond now.',
                icon: '/favicon.ico',
                tag: 'new-lead',
              })
            }
            refresh()
          } else if (row.direction === 'outbound') {
            // Rep responded from another page (Leads, customer detail, etc.)
            // Refresh so the original inbound card is removed from Today queue
            refresh()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'activities' },
        (payload) => {
          const row = payload.new as Activity
          // Re-sort/remove when a lead is addressed or completed
          if (row.addressed_at || row.completed_at) refresh()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, refresh])

  // ── Build the unified priority queue ────────────────────────────────────────
  const queue = buildQueue(newLeads, apptRequests, voiceLeads, tasks, waiting, responded, vehicleMatches)

  // Group by tier for rendering
  const tierGroups = new Map<number, typeof queue>()
  for (const item of queue) {
    if (!tierGroups.has(item.tier)) tierGroups.set(item.tier, [])
    tierGroups.get(item.tier)!.push(item)
  }

  // KPI counts from queue
  const newLeadCount = queue.filter(i => i.type === 'new_lead').length
  const overdueCount = queue.filter(i => i.tier === 3).length
  const todayCount   = queue.filter(i => i.tier === 4).length
  const waitingCount = queue.filter(i => i.tier === 5).length
  const missedCount  = queue.filter(i => i.type === 'voice_lead').length

  // Tier label colors
  const tierColor: Record<number, string> = {
    1: 'text-primary',
    2: 'text-orange-500',
    3: 'text-destructive',
    4: 'text-blue-500',
    5: 'text-muted-foreground',
  }

  return (
    <div className="page-enter">
      <div className="gradient-sunset px-4 py-2.5 text-white flex items-center gap-3">
        <Image src="/logo-mark.png" alt="DealerWyze" width={32} height={32} className="rounded-md flex-shrink-0 opacity-90" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight" suppressHydrationWarning style={{ fontFamily: 'var(--font-display)' }}>
            {dateLabel || '…'}
          </h1>
        </div>
      </div>

      {/* KPI chips — display only, no filter */}
      <div className="lg:hidden flex gap-2 px-4 pt-2 pb-1 overflow-x-auto no-scrollbar">
        {newLeadCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
            <span className="text-lg font-bold text-primary leading-none">{newLeadCount}</span>
            <span className="text-[10px] text-primary/80 mt-0.5 whitespace-nowrap">New Leads</span>
          </div>
        )}
        {missedCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <span className="text-lg font-bold text-orange-600 leading-none">{missedCount}</span>
            <span className="text-[10px] text-orange-600/80 mt-0.5 whitespace-nowrap">Missed Calls</span>
          </div>
        )}
        {overdueCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <span className="text-lg font-bold text-red-600 leading-none">{overdueCount}</span>
            <span className="text-[10px] text-red-600/80 mt-0.5 whitespace-nowrap">Overdue</span>
          </div>
        )}
        {todayCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <span className="text-lg font-bold text-blue-600 leading-none">{todayCount}</span>
            <span className="text-[10px] text-blue-600/80 mt-0.5 whitespace-nowrap">Due Today</span>
          </div>
        )}
        {waitingCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-lg font-bold text-amber-600 leading-none">{waitingCount}</span>
            <span className="text-[10px] text-amber-600/80 mt-0.5 whitespace-nowrap">Waiting</span>
          </div>
        )}
      </div>

      <div className="px-4 py-2 space-y-6">

        {queue.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-medium">All clear!</p>
            <p className="text-sm mt-1">Nothing pending for today.</p>
          </div>
        )}

        {Array.from(tierGroups.entries()).map(([tier, items]) => (
          <section key={tier}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${tierColor[tier]}`}>
              {TIER_LABELS[tier]} ({items.length})
            </p>
            <motion.div
              className="space-y-2"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
            >
              {items.map(item => {
                const { key, type, data } = item
                let card: React.ReactNode
                if (type === 'new_lead') {
                  const actId = (data as Activity).id
                  card = (
                    <NewLeadCard
                      activity={data as Parameters<typeof NewLeadCard>[0]['activity']}
                      onUpdate={refresh}
                      onAddressed={() => {
                        dismissedIds.current.add(actId)
                        setNewLeads(prev => prev.filter(a => a.id !== actId))
                      }}
                      hasResponded={responded.includes(item.customerId ?? '')}
                      sequenceStatus={item.customerId ? sequenceStatusMap[item.customerId] ?? null : null}
                    />
                  )
                } else if (type === 'vehicle_match') {
                  card = (
                    <VehicleMatchCard
                      activity={data as Parameters<typeof VehicleMatchCard>[0]['activity']}
                      onUpdate={refresh}
                    />
                  )
                } else if (type === 'appt_request') {
                  card = (
                    <AppointmentRequestCard
                      activity={data as Parameters<typeof AppointmentRequestCard>[0]['activity']}
                      onUpdate={refresh}
                    />
                  )
                } else if (type === 'voice_lead') {
                  card = <VoiceLeadCard call={data as VoiceCall} onUpdate={refresh} />
                } else if (type === 'overdue_followup' || type === 'today_followup') {
                  card = (
                    <EmailFollowUpItem
                      activity={data as Parameters<typeof EmailFollowUpItem>[0]['activity']}
                      onUpdate={refresh}
                      hasResponded={responded.includes(item.customerId ?? '')}
                    />
                  )
                } else if (type === 'waiting_responded' || type === 'waiting') {
                  card = (
                    <WaitingItem
                      activity={data as Activity}
                      onUpdate={refresh}
                      hasResponded={type === 'waiting_responded'}
                    />
                  )
                } else {
                  // overdue_task, today_task (includes scheduled appointments in tier 2)
                  card = <TaskItem activity={data as Activity} onUpdate={refresh} />
                }

                return (
                  <motion.div
                    key={key}
                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } } }}
                  >
                    {card}
                  </motion.div>
                )
              })}
            </motion.div>
          </section>
        ))}
        {motivationalMsg && (
          <p className="text-xs italic opacity-60 text-muted-foreground text-center mt-4 pb-2" suppressHydrationWarning>
            {motivationalMsg}
          </p>
        )}
      </div>

      <AfterCallModal open={modalOpen} pendingCall={pendingCall} onDismiss={dismissModal} />
    </div>
  )
}
