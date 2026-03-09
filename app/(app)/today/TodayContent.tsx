'use client'

import { useState, useCallback, useEffect } from 'react'
import { Activity, Template, VoiceCall } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { shouldShowAddressedActivity } from '@/lib/utils'
import TaskItem from '@/components/today/TaskItem'
import WaitingItem from '@/components/today/WaitingItem'
import TodayFilters from '@/components/today/TodayFilters'
import AfterCallModal from '@/components/call/AfterCallModal'
import { usePendingCall } from '@/components/call/usePendingCall'
import NewLeadCard from '@/components/leads/NewLeadCard'
import VoiceLeadCard from '@/components/leads/VoiceLeadCard'
import EmailFollowUpItem from '@/components/leads/EmailFollowUpItem'
import AppointmentRequestCard from '@/components/today/AppointmentRequestCard'

type FilterType = 'all' | 'overdue' | 'today' | 'waiting'

interface TodayContentProps {
  initialNewLeads: Activity[]
  initialTasks: Activity[]
  initialWaiting: Activity[]
  leadTemplates: Template[]
  initialApptRequests: Activity[]
  initialVoiceLeads: VoiceCall[]
  businessName?: string
  respondedCustomerIds?: string[]
}

export default function TodayContent({ initialNewLeads, initialTasks, initialWaiting, leadTemplates, initialApptRequests, initialVoiceLeads, businessName = 'DealerWyze', respondedCustomerIds = [] }: TodayContentProps) {
  const [newLeads, setNewLeads] = useState<Activity[]>(initialNewLeads)
  const [tasks, setTasks] = useState<Activity[]>(initialTasks)
  const [waiting, setWaiting] = useState<Activity[]>(initialWaiting)
  const [apptRequests, setApptRequests] = useState<Activity[]>(initialApptRequests)
  const [voiceLeads, setVoiceLeads] = useState<VoiceCall[]>(initialVoiceLeads)
  const [filter, setFilter] = useState<FilterType>('all')
  const [leadSort, setLeadSort] = useState<'newest' | 'oldest'>('newest')
  const { pendingCall, modalOpen, dismissModal } = usePendingCall()
  const supabase = createClient()
  const [dateLabel, setDateLabel] = useState('')
  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  }, [])

  const refresh = useCallback(async () => {
    const now = new Date().toISOString()
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ data: leads }, { data: t }, { data: w }] = await Promise.all([
      supabase
        .from('activities')
        .select('*, customer:customers(id, name, primary_phone, email)')
        .eq('type', 'email')
        .eq('direction', 'inbound')
        .eq('outcome', 'pending')
        .is('completed_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select('*, customer:customers(id, name, primary_phone, email)')
        .in('type', ['task', 'appointment', 'call', 'sms', 'email'])
        .is('completed_at', null)
        .not('direction', 'eq', 'inbound')
        .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
        .lte('due_at', todayEnd.toISOString())
        .not('due_at', 'is', null)
        .order('priority', { ascending: false })
        .order('due_at', { ascending: true }),
      supabase
        .from('activities')
        .select('*, customer:customers(id, name, primary_phone)')
        .eq('direction', 'outbound')
        .in('type', ['call', 'sms', 'email'])
        .not('outcome', 'eq', 'pending')
        .lt('created_at', yesterday)
        .is('completed_at', null)
        .order('created_at', { ascending: false }),
    ])

    const seenCustomers = new Set<string>()
    const dedupedWaiting = (w || []).filter(a => {
      if (!a.customer_id || seenCustomers.has(a.customer_id)) return false
      seenCustomers.add(a.customer_id)
      return true
    })

    // Guard against orphaned rows where the customer join is null
    // Hide addressed cards until next day or follow-up
    const todayRef = new Date()
    const safeLeads = (leads || []).filter(
      a => a.customer != null && shouldShowAddressedActivity(a, todayRef)
    )

    const tasksFiltered = (t || []).filter(a => shouldShowAddressedActivity(a, todayRef))

    const { data: appts } = await supabase
      .from('activities')
      .select('*, customer:customers(id, name, primary_phone)')
      .eq('type', 'appointment')
      .eq('direction', 'inbound')
      .eq('outcome', 'pending')
      .is('completed_at', null)
      .order('created_at', { ascending: false })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: voices } = await supabase
      .from('voice_calls')
      .select('*, customer:customers(id, name, primary_phone), linked_task:tasks(id, status)')
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })

    // Hide dismissed cards: exclude calls where the linked task is already done
    const activeVoices = (voices || []).filter(
      (v: { task_id?: string | null; linked_task?: { status: string } | null }) =>
        !v.task_id || v.linked_task?.status !== 'done'
    )

    const apptsFiltered = (appts || []).filter(
      a => a.customer != null && shouldShowAddressedActivity(a, todayRef)
    )

    setNewLeads(safeLeads)
    setTasks(tasksFiltered)
    setWaiting(dedupedWaiting)
    setApptRequests(apptsFiltered)
    setVoiceLeads(activeVoices)
  }, [supabase])

  const now = new Date()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  // Separate follow-up email tasks from regular tasks
  const followUpTasks = tasks.filter(a => a.type === 'email' && a.sequence_day && a.sequence_day >= 2)
  const regularTasks = tasks.filter(a => !(a.type === 'email' && a.sequence_day && a.sequence_day >= 2))

  const overdue = regularTasks.filter(a => a.due_at && new Date(a.due_at) < now && a.type !== 'appointment')
  const todayTasks = regularTasks.filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= todayEnd)
  const appointments = regularTasks.filter(a => a.type === 'appointment')
  const overdueFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) < now)
  const todayFollowUps = followUpTasks.filter(a => a.due_at && new Date(a.due_at) >= now)

  const counts = {
    all: newLeads.length + tasks.length + waiting.length + apptRequests.length + voiceLeads.length,
    overdue: overdue.length + overdueFollowUps.length,
    today: todayTasks.length + todayFollowUps.length,
    waiting: waiting.length,
  }

  return (
    <>
      <div className="gradient-sunset px-4 py-2.5 text-white flex items-center justify-between">
        <div>
          <p className="text-base font-bold leading-tight">Good morning 👋</p>
          <p className="text-xs opacity-70 mt-0.5" suppressHydrationWarning>
            {businessName} · {dateLabel || '…'}
          </p>
        </div>
      </div>

      <TodayFilters active={filter} onChange={setFilter} counts={counts} />

      <div className="px-4 py-2 space-y-4">
        {/* Appointment Requests */}
        {(filter === 'all' || filter === 'today') && apptRequests.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">
              Appointment Requests ({apptRequests.length})
            </p>
            <div className="space-y-2">
              {apptRequests.map(a => (
                <AppointmentRequestCard
                  key={a.id}
                  activity={a as Parameters<typeof AppointmentRequestCard>[0]['activity']}
                  onUpdate={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {/* Voice Leads (missed calls) */}
        {(filter === 'all' || filter === 'overdue') && voiceLeads.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">
              Missed Calls ({voiceLeads.length})
            </p>
            <div className="space-y-2">
              {voiceLeads.map(v => (
                <VoiceLeadCard key={v.id} call={v} onUpdate={refresh} />
              ))}
            </div>
          </section>
        )}

        {/* New Leads */}
        {(filter === 'all' || filter === 'overdue') && newLeads.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                New Leads ({newLeads.length})
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setLeadSort('newest')}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${leadSort === 'newest' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Newest
                </button>
                <button
                  onClick={() => setLeadSort('oldest')}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${leadSort === 'oldest' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Oldest
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {[...newLeads]
                .sort((a, b) => leadSort === 'oldest'
                  ? a.created_at.localeCompare(b.created_at)
                  : b.created_at.localeCompare(a.created_at))
                .map(a => (
                  <NewLeadCard
                    key={a.id}
                    activity={a as Parameters<typeof NewLeadCard>[0]['activity']}
                    templates={leadTemplates}
                    onUpdate={refresh}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Appointments */}
        {(filter === 'all' || filter === 'today') && appointments.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Appointments Today</p>
            <div className="space-y-2">
              {appointments.map(a => <TaskItem key={a.id} activity={a} onUpdate={refresh} />)}
            </div>
          </section>
        )}

        {/* Overdue */}
        {(filter === 'all' || filter === 'overdue') && (overdue.length > 0 || overdueFollowUps.length > 0) && (
          <section>
            <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Overdue</p>
            <div className="space-y-2">
              {overdueFollowUps.map(a => (
                <EmailFollowUpItem
                  key={a.id}
                  activity={a as Parameters<typeof EmailFollowUpItem>[0]['activity']}
                  onUpdate={refresh}
                />
              ))}
              {overdue.map(a => <TaskItem key={a.id} activity={a} onUpdate={refresh} />)}
            </div>
          </section>
        )}

        {/* Due today */}
        {(filter === 'all' || filter === 'today') && (todayTasks.length > 0 || todayFollowUps.length > 0) && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Due Today</p>
            <div className="space-y-2">
              {todayFollowUps.map(a => (
                <EmailFollowUpItem
                  key={a.id}
                  activity={a as Parameters<typeof EmailFollowUpItem>[0]['activity']}
                  onUpdate={refresh}
                />
              ))}
              {todayTasks.map(a => <TaskItem key={a.id} activity={a} onUpdate={refresh} />)}
            </div>
          </section>
        )}

        {/* Waiting on customer */}
        {(filter === 'all' || filter === 'waiting') && waiting.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Waiting on Customer</p>
            <div className="space-y-2">
              {waiting.map(a => (
              <WaitingItem
                key={a.id}
                activity={a}
                onUpdate={refresh}
                hasResponded={respondedCustomerIds.includes(a.customer_id ?? '')}
              />
            ))}
            </div>
          </section>
        )}

        {counts.all === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-medium">All clear!</p>
            <p className="text-sm mt-1">Nothing pending for today.</p>
          </div>
        )}

        {filter !== 'all' && (
          filter === 'overdue' ? overdue.length + overdueFollowUps.length + newLeads.length === 0 :
          filter === 'today' ? todayTasks.length + appointments.length + todayFollowUps.length === 0 :
          waiting.length === 0
        ) && (
          <div className="text-center py-8 text-muted-foreground text-sm">Nothing in this filter.</div>
        )}
      </div>

      <AfterCallModal open={modalOpen} pendingCall={pendingCall} onDismiss={dismissModal} />
    </>
  )
}
