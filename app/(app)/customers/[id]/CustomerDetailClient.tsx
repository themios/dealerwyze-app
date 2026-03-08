'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Customer, Activity, Vehicle } from '@/types'
import { createClient } from '@/lib/supabase/client'
import CallButton from '@/components/call/CallButton'
import TemplatePicker from '@/components/sms/TemplatePicker'
import EmailButton from '@/components/customer/EmailButton'
import AfterCallModal from '@/components/call/AfterCallModal'
import ActivityTimeline from '@/components/customer/ActivityTimeline'
import AddTaskModal from '@/components/customer/AddTaskModal'
import AddNoteModal from '@/components/customer/AddNoteModal'
import LinkVehicleSheet from '@/components/customer/LinkVehicleSheet'
import LinkedVehicles from '@/components/customer/LinkedVehicles'
import VoiceRecorder from '@/components/call/VoiceRecorder'
import AssignDropdown from '@/components/customer/AssignDropdown'
import DocumentsSection from '@/components/customer/DocumentsSection'
import { usePendingCall } from '@/components/call/usePendingCall'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { formatPhone } from '@/lib/utils'
import LeadStateSelector from '@/components/customer/LeadStateSelector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Plus, FileText, Archive, X, MessageSquareOff, Trophy } from 'lucide-react'

interface TaskItem {
  id: string
  title: string
  task_type: string
  priority: string
  due_at: string | null
  status: string
  notes: string | null
}

interface Props {
  customer: Customer
  activities: Activity[]
  isAdmin: boolean
  currentUserId?: string
  tasks: TaskItem[]
}

export default function CustomerDetailClient({ customer, activities: initialActivities, isAdmin, currentUserId, tasks: initialTasks }: Props) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities)
  const [taskOpen, setTaskOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [vehicleRefreshKey, setVehicleRefreshKey] = useState(0)
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | undefined>(undefined)
  const [localTasks, setLocalTasks] = useState<TaskItem[]>(initialTasks)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: string; display_name: string }[]>([])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [soldOpen, setSoldOpen] = useState(false)
  const [soldNotes, setSoldNotes] = useState('')
  const [selling, setSelling]    = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const { pendingCall, modalOpen, dismissModal } = usePendingCall()
  const orgSettings = useOrgSettings()
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase
      .from('customer_vehicles')
      .select('vehicle:vehicles(*)')
      .eq('customer_id', customer.id)
      .then(({ data }) => {
        if (!data || data.length === 0) return
        // Prefer an active (non-sold) vehicle; fall back to most recent
        const active = data.find(d => {
          const v = d.vehicle as unknown as Vehicle
          return v && v.status !== 'sold' && v.status !== 'sync_removed'
        })
        const best = active || data[0]
        if (best?.vehicle) setPrimaryVehicle(best.vehicle as unknown as Vehicle)
      })
  }, [customer.id, vehicleRefreshKey, supabase])

  const refreshActivities = useCallback(async () => {
    const { data } = await supabase
      .from('activities')
      .select('*, vehicle:vehicles(id, year, make, model)')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setActivities(data || [])
  }, [customer.id, supabase])

  async function handleMarkSold() {
    setSelling(true)
    setSellError(null)
    const res = await fetch(`/api/customers/${customer.id}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'sold', reason: soldNotes || 'Marked sold' }),
    })
    setSelling(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setSellError(d.error ?? 'Failed to mark sold')
      return
    }
    setSoldOpen(false)
    setSoldNotes('')
    refreshActivities()
    router.refresh()
  }

  async function completeTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    setLocalTasks(prev => prev.filter(t => t.id !== id))
  }

  async function loadTeamMembers() {
    if (teamMembers.length > 0) return
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .is('deactivated_at', null)
      .order('display_name')
    setTeamMembers(data ?? [])
  }

  async function addQuickTask() {
    if (!quickTaskTitle.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: quickTaskTitle.trim(),
        task_type: 'manual',
        priority: 'should',
        linked_customer_id: customer.id,
        assigned_to_user_id: quickTaskAssignee || null,
      }),
    })
    if (res.ok) {
      const data = await res.json() as { task?: TaskItem }
      if (data.task) {
        setLocalTasks(prev => [data.task!, ...prev])
      }
      setQuickTaskTitle('')
      setQuickTaskAssignee('')
      setQuickTaskOpen(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    await supabase
      .from('customers')
      .update({ archived: true, archived_reason: archiveReason || null })
      .eq('id', customer.id)
    setArchiving(false)
    router.push('/customers')
  }

  return (
    <div className="pb-6">
      {/* Contact info */}
      <div className="px-4 py-3 border-b">
        <p className="text-lg font-semibold">{formatPhone(customer.primary_phone)}</p>
        {customer.secondary_phone && (
          <p className="text-sm text-muted-foreground">{formatPhone(customer.secondary_phone)}</p>
        )}
        {customer.email && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Mail className="h-3.5 w-3.5" />
            {customer.email}
          </p>
        )}
        {customer.sms_opt_out && (
          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5 w-fit">
            <MessageSquareOff className="h-3.5 w-3.5 flex-shrink-0" />
            This customer asked to stop texts. You can&apos;t send SMS to this number.
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-xs text-muted-foreground">Lead state:</span>
          <LeadStateSelector
            customerId={customer.id}
            currentState={customer.thread_state ?? 'new_lead'}
          />
        </div>
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {customer.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        {customer.notes && (
          <p className="text-sm text-muted-foreground mt-2 italic">{customer.notes}</p>
        )}
      </div>

      {/* Assign to (admin only) */}
      {isAdmin && (
        <AssignDropdown
          customerId={customer.id}
          assignedTo={customer.assigned_to}
        />
      )}

      {/* Primary actions */}
      <div className="px-4 py-3 flex gap-2 border-b">
        <CallButton customerId={customer.id} customerName={customer.name} phone={customer.primary_phone} className="flex-1" />
        <TemplatePicker customer={customer} vehicle={primaryVehicle} />
        <EmailButton customer={customer} vehicle={primaryVehicle} />
      </div>

      {/* Secondary actions */}
      <div className="px-4 py-2 flex gap-2 border-b">
        <Button variant="ghost" size="sm" onClick={() => setTaskOpen(true)} className="flex-1 gap-1.5">
          <Plus className="h-4 w-4" />Task
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)} className="flex-1 gap-1.5">
          <FileText className="h-4 w-4" />Note
        </Button>
        <div className={primaryVehicle ? 'flex justify-center' : 'flex-1 flex justify-center'}>
          <LinkVehicleSheet customerId={customer.id} onLinked={() => setVehicleRefreshKey(k => k + 1)} hasVehicle={!!primaryVehicle} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(v => !v)} className="gap-1.5 text-muted-foreground" title="Archive">
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSoldOpen(v => !v)}
          className={`gap-1.5 ${customer.thread_state === 'sold' ? 'text-green-600' : 'text-muted-foreground'}`}
          disabled={customer.thread_state === 'sold'}
          title="Mark as sold"
        >
          <Trophy className="h-4 w-4" />
        </Button>
      </div>

      {/* Sold panel */}
      {soldOpen && customer.thread_state !== 'sold' && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Mark this deal as sold?</p>
            <button onClick={() => { setSoldOpen(false); setSoldNotes('') }} title="Close">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <Input
            placeholder="Notes (optional — stock #, price, etc.)"
            value={soldNotes}
            onChange={e => setSoldNotes(e.target.value)}
            className="h-9 text-sm"
          />
          {sellError && (
            <p className="text-xs text-red-600">{sellError}</p>
          )}
          <Button
            size="sm"
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={handleMarkSold}
            disabled={selling}
          >
            {selling ? 'Saving…' : '🏆 Mark as Sold'}
          </Button>
        </div>
      )}

      {/* Archive panel */}
      {archiveOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-destructive">Archive this lead?</p>
            <button onClick={() => { setArchiveOpen(false); setArchiveReason('') }} title="Close">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <Input
            placeholder="Reason (optional)"
            value={archiveReason}
            onChange={e => setArchiveReason(e.target.value)}
            className="h-9 text-sm"
          />
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleArchive}
            disabled={archiving}
          >
            {archiving ? 'Archiving…' : 'Archive Lead'}
          </Button>
        </div>
      )}

      <LinkedVehicles customerId={customer.id} refreshKey={vehicleRefreshKey} />

      {/* Tasks */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-l-2 border-[#F07018] pl-2">Open Tasks</h3>
          <button
            onClick={() => { setQuickTaskOpen(true); void loadTeamMembers() }}
            className="text-xs text-primary font-medium flex items-center gap-1"
            title="Add task"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {localTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No open tasks</p>
        ) : (
          <div className="space-y-1">
            {localTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                <span className={`w-2 h-2 rounded-full shrink-0 ${t.priority === 'must' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="text-sm flex-1 truncate">{t.title}</span>
                {t.due_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(t.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button
                  onClick={() => void completeTask(t.id)}
                  className="text-xs text-muted-foreground hover:text-green-600 shrink-0 px-1"
                  title="Mark done"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        )}
        {quickTaskOpen && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={quickTaskTitle}
                onChange={e => setQuickTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addQuickTask(); if (e.key === 'Escape') setQuickTaskOpen(false) }}
                placeholder="Task title…"
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F07018]"
              />
              <button
                onClick={() => void addQuickTask()}
                disabled={!quickTaskTitle.trim()}
                className="rounded-md bg-[#F07018] text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >Add</button>
              <button onClick={() => { setQuickTaskOpen(false); setQuickTaskAssignee('') }} className="p-1.5 text-muted-foreground" title="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
            {isAdmin && teamMembers.length > 0 && (
              <select
                value={quickTaskAssignee}
                onChange={e => setQuickTaskAssignee(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#F07018]"
              >
                <option value="">Assign to… (optional)</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <DocumentsSection customerId={customer.id} />

      <div className="px-4 py-3 border-b">
        <VoiceRecorder customerId={customer.id} onSaved={refreshActivities} />
      </div>

      <div className="px-4 py-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 border-l-2 border-[#F07018] pl-2">Activity</h2>
        <ActivityTimeline activities={activities} currentUserId={currentUserId} isAdmin={isAdmin} onNoteUpdated={refreshActivities} />
      </div>

      <AddTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} customerId={customer.id} customerName={customer.name} vehicleId={primaryVehicle?.id} orgName={orgSettings.dealerName} orgPhone={orgSettings.dealerPhone} orgAddress={orgSettings.dealerAddress} onSaved={refreshActivities} />
      <AddNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} customerId={customer.id} onSaved={refreshActivities} />
      <AfterCallModal open={modalOpen} pendingCall={pendingCall} onDismiss={() => { dismissModal(); refreshActivities() }} />
    </div>
  )
}
