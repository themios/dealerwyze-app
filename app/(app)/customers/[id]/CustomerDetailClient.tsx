'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Customer, Activity, Vehicle } from '@/types'
import { createClient } from '@/lib/supabase/client'
import CallButton from '@/components/call/CallButton'
import TemplatePicker from '@/components/sms/TemplatePicker'
import EmailButton, { ReplyContext } from '@/components/customer/EmailButton'
import AfterCallModal from '@/components/call/AfterCallModal'
import ActivityTimeline from '@/components/customer/ActivityTimeline'
import AddTaskModal from '@/components/customer/AddTaskModal'
import AddNoteModal from '@/components/customer/AddNoteModal'
import LinkVehicleSheet from '@/components/customer/LinkVehicleSheet'
import LinkedVehicles from '@/components/customer/LinkedVehicles'
import VoiceRecorder from '@/components/call/VoiceRecorder'
import AssignDropdown from '@/components/customer/AssignDropdown'
import LeadLocationBadge, { type DealerLocationOption } from '@/components/customer/LeadLocationBadge'
import LeadLocationBlockingModal from '@/components/customer/LeadLocationBlockingModal'
import { needsLeadLocationBlock } from '@/lib/locations/uiRules'
import { useVertical } from "@/hooks/useVertical"
import DocumentsSection from '@/components/customer/DocumentsSection'
import WantListSheet from '@/components/customer/WantListSheet'
import AutoresponderCard from '@/components/sequences/AutoresponderCard'
import ScheduledOutreachCard from '@/components/customer/ScheduledOutreachCard'
import MergeCustomerSheet from '@/components/customers/MergeCustomerSheet'
import DealChecklistSheet from '@/components/customers/DealChecklistSheet'
import { usePendingCall } from '@/components/call/usePendingCall'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { useAnalytics } from '@/hooks/useAnalytics'
import { formatPhone } from '@/lib/utils'
import LeadStateSelector from '@/components/customer/LeadStateSelector'
import DateTimePicker15 from '@/components/ui/DateTimePicker15'
import { LEAD_INTENT_TIER_LABELS, LEAD_INTENT_TIER_STYLES, buildManualLeadIntent, normalizeLeadIntentFlags, type LeadIntentFlag, type LeadIntentTier } from '@/lib/leads/intent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Phone, Plus, FileText, Archive, X, MessageSquareOff, Trophy, Trash2, GitMerge, Clock, Pencil, ClipboardList, Flame, PhoneCall, CalendarClock, RotateCcw, Loader2 } from 'lucide-react'

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
  customer: any // Supabase query result type
  activities: Activity[]
  scheduledActivities: Activity[]
  isAdmin: boolean
  currentUserId?: string
  tasks: TaskItem[]
  initialVehicle?: Record<string, unknown> | null
  orgOwnerName?: string | null
  isMultiLocation?: boolean
  locations?: DealerLocationOption[]
}

export default function CustomerDetailClient({ customer, activities: initialActivities, scheduledActivities, isAdmin, currentUserId, tasks: initialTasks, initialVehicle, orgOwnerName = null, isMultiLocation = false, locations = [] }: Props) {
    const initialLocationId = customer.location_id ?? null
  const initialLocationObj = initialLocationId ? locations.find(l => l.id === initialLocationId) : null
  const { vertical } = useVertical()
  const [leadLocationId, setLeadLocationId] = useState<string | null>(initialLocationId)
  const [leadLocationName, setLeadLocationName] = useState<string | null>(() => {
    return initialLocationObj?.name ?? null
  })
  const [leadLocationShortCode, setLeadLocationShortCode] = useState<string | null>(() => {
    return initialLocationObj?.short_code ?? null
  })
  const needsLocationBlock = needsLeadLocationBlock(isMultiLocation, leadLocationId)

  function handleLocationSet(locationId: string, locationName: string, shortCode?: string | null) {
    setLeadLocationId(locationId)
    setLeadLocationName(locationName)
    setLeadLocationShortCode(shortCode ?? null)
  }
  const [activities, setActivities] = useState<Activity[]>(initialActivities)

  const upcomingAppointments = activities
    .filter(a => a.type === 'appointment' && !a.completed_at && a.due_at && new Date(a.due_at) > new Date())
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [apptDatetime, setApptDatetime] = useState('')
  const [editingApptId, setEditingApptId] = useState<string | null>(null)
  const [deletingApptId, setDeletingApptId] = useState<string | null>(null)
  const [apptSaving, setApptSaving] = useState(false)
  const [apptError, setApptError] = useState<string | null>(null)
  const [vehicleRefreshKey, setVehicleRefreshKey] = useState(0)
  const [linkVehicleOpen, setLinkVehicleOpen] = useState(false)
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | undefined>(initialVehicle as Vehicle | undefined)
  const [localTasks, setLocalTasks] = useState<TaskItem[]>(initialTasks)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: string; display_name: string }[]>([])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [archiveDocs, setArchiveDocs] = useState<{ id: string; label: string; file_name: string; signed_url?: string | null }[]>([])
  const [archiveDocsLoading, setArchiveDocsLoading] = useState(false)
  const [archiveDocDeleting, setArchiveDocDeleting] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [soldOpen, setSoldOpen] = useState(false)
  const [soldNotes, setSoldNotes] = useState('')
  const [selling, setSelling]    = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen]         = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState('')
  const [snoozing, setSnoozing] = useState(false)
  const [snoozeError, setSnoozeError] = useState<string | null>(null)
  const [autoOverride, setAutoOverride] = useState<string | null>(
    (customer as unknown as Record<string, unknown>).automation_override as string | null ?? null
  )
  const [savingAuto, setSavingAuto] = useState(false)
  const custExt = customer as unknown as Record<string, unknown>
  const [unsubEmail, setUnsubEmail] = useState<boolean>(!!(custExt.unsubscribe_email))
  const [unsubSms, setUnsubSms] = useState<boolean>(!!(custExt.unsubscribe_sms))
  const [savingUnsub, setSavingUnsub] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)
  const initialTier = (customer.lead_intent_tier === 'hot' || customer.lead_intent_tier === 'warm' || customer.lead_intent_tier === 'active' || customer.lead_intent_tier === 'standard'
    ? customer.lead_intent_tier
    : customer.lead_rating === 'hot'
      ? 'hot'
      : 'standard') as LeadIntentTier
  const [intentTier, setIntentTier] = useState<LeadIntentTier>(initialTier)
  const [intentFlags, setIntentFlags] = useState<LeadIntentFlag[]>(Array.isArray(customer.lead_intent_flags) ? customer.lead_intent_flags as LeadIntentFlag[] : [])
  const [intentNote, setIntentNote] = useState(customer.lead_intent_manual_note ?? '')
  const [intentSaving, setIntentSaving] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)
  const [intentSnapshot, setIntentSnapshot] = useState(() => ({
    score: customer.lead_intent_score ?? (initialTier === 'hot' ? 90 : initialTier === 'warm' ? 60 : initialTier === 'active' ? 30 : 0),
    tier: initialTier,
    flags: normalizeLeadIntentFlags(customer.lead_intent_flags),
    summary: customer.lead_intent_summary ?? customer.lead_intent_manual_note ?? null,
    source: customer.lead_intent_source ?? null,
    manualNote: customer.lead_intent_manual_note ?? null,
    updatedAt: customer.lead_intent_updated_at ?? new Date().toISOString(),
  }))
  const { pendingCall, modalOpen, dismissModal } = usePendingCall()
  const orgSettings = useOrgSettings()
  const { track } = useAnalytics()
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    track({ event: 'customer_viewed', props: {} })
  }, [track])

  useEffect(() => {
    supabase
      .from('customer_vehicles')
      .select('vehicle:vehicles(*)')
      .eq('customer_id', customer.id)
      .order("created_at", { ascending: false })
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
      .or('completed_at.not.is.null,customer_sequence_id.is.null')
      .order('created_at', { ascending: false })
      .limit(100)
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

  async function openArchivePanel() {
    setArchiveOpen(v => {
      if (!v) {
        // Load docs when opening
        setArchiveDocsLoading(true)
        fetch(`/api/customers/${customer.id}/documents`)
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setArchiveDocs(data) })
          .catch(() => {})
          .finally(() => setArchiveDocsLoading(false))
      } else {
        setArchiveDocs([])
        setArchiveReason('')
      }
      return !v
    })
  }

  async function deleteArchiveDoc(docId: string) {
    setArchiveDocDeleting(docId)
    const res = await fetch(`/api/customers/${customer.id}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) setArchiveDocs(prev => prev.filter(d => d.id !== docId))
    setArchiveDocDeleting(null)
  }

  async function setAutomationOverride(value: string | null) {
    setSavingAuto(true)
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automation_override: value }),
    })
    setAutoOverride(value)
    setSavingAuto(false)
  }

  async function toggleUnsubscribe(field: 'unsubscribe_email' | 'unsubscribe_sms', value: boolean) {
    setSavingUnsub(true)
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (field === 'unsubscribe_email') setUnsubEmail(value)
    else setUnsubSms(value)
    setSavingUnsub(false)
  }

  async function handleArchive() {
    setArchiving(true)
    setArchiveError(null)
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true, archived_reason: archiveReason || null }),
    })
    setArchiving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setArchiveError(data.error ?? 'Failed to archive lead')
      return
    }
    router.push('/customers')
  }

  function snoozePresetDate(preset: 'tomorrow' | '3days' | '1week' | '2weeks'): string {
    const d = new Date()
    if (preset === 'tomorrow')  { d.setDate(d.getDate() + 1) }
    if (preset === '3days')     { d.setDate(d.getDate() + 3) }
    if (preset === '1week')     { d.setDate(d.getDate() + 7) }
    if (preset === '2weeks')    { d.setDate(d.getDate() + 14) }
    d.setHours(8, 0, 0, 0)
    return d.toISOString()
  }

  async function handleSnooze(isoDate: string) {
    setSnoozing(true)
    setSnoozeError(null)
    // Snooze all pending inbound activities for this customer
    const pending = activities.filter(a =>
      (a as unknown as Record<string, unknown>).direction === 'inbound' &&
      !(a as unknown as Record<string, unknown>).completed_at &&
      (a as unknown as Record<string, unknown>).outcome === 'pending'
    )
    if (pending.length === 0) {
      // No pending activities — create a follow-up task instead
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Follow up with ${customer.name}`,
          task_type: 'manual',
          priority: 'should',
          linked_customer_id: customer.id,
          due_at: isoDate,
        }),
      })
    } else {
      await Promise.all(pending.map(a =>
        fetch(`/api/activities/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snoozed_until: isoDate }),
        })
      ))
    }
    setSnoozing(false)
    setSnoozeOpen(false)
    setSnoozeDate('')
    router.refresh()
  }

  async function handleSaveAppt() {
    if (!apptDatetime) return
    setApptSaving(true)
    setApptError(null)
    const dueAt = new Date(apptDatetime).toISOString()

    let res: Response
    if (editingApptId) {
      res = await fetch(`/api/activities/${editingApptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_at: dueAt }),
      })
    } else {
      res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'appointment',
          customer_id: customer.id,
          due_at: dueAt,
          direction: null,
          outcome: 'pending',
          priority: 'high',
          body: `Appointment${primaryVehicle ? ` re: ${primaryVehicle.year === 0 && primaryVehicle.make === "RE" ? primaryVehicle.model : `${primaryVehicle.year} ${primaryVehicle.make} ${primaryVehicle.model}`}` : ''}`,
        }),
      })
    }

    const data = await res.json().catch(() => ({})) as { error?: string; activity?: Activity }
    if (!res.ok) {
      setApptSaving(false)
      setApptError(data.error ?? 'Failed to save appointment')
      return
    }

    // Update local state immediately so the UI reflects the change without waiting for router.refresh()
    if (editingApptId) {
      setActivities(prev => prev.map(a => a.id === editingApptId ? { ...a, due_at: dueAt } : a))
    } else if (data.activity) {
      setActivities(prev => [...prev, data.activity!])
    }

    // Advance lead state to appointment_set if not already past that stage (new appt only)
    if (!editingApptId) {
      const nonApptStates = new Set(['appointment_confirmed', 'showed', 'credit_app', 'sold', 'lost'])
      if (!nonApptStates.has(customer.thread_state ?? '')) {
        await fetch(`/api/customers/${customer.id}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'appointment_set', reason: 'Appointment scheduled' }),
        }).catch(() => {})
      }
    }

    setApptSaving(false)
    setApptOpen(false)
    setApptDatetime('')
    setEditingApptId(null)
    setApptError(null)
  }

  async function handleDeleteAppt(id: string) {
    setDeletingApptId(id)
    // Optimistically remove so UI updates immediately
    setActivities(prev => prev.filter(a => a.id !== id))
    await fetch(`/api/activities/${id}`, { method: 'DELETE' })
    setDeletingApptId(null)
  }

  async function handleDelete() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') return
    setDeleting(true)
    setDeleteError(null)

    const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' })
    setDeleting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setDeleteError(data.error ?? 'Failed to delete contact')
      return
    }

    toast.success('Deleted. You can recover this within 7 days from your account admin or by contacting support.')
    router.push('/customers')
  }

  function toggleIntentFlag(flag: LeadIntentFlag) {
    setIntentFlags(prev => prev.includes(flag) ? prev.filter(v => v !== flag) : [...prev, flag])
  }

  async function saveLeadIntent() {
    setIntentSaving(true)
    setIntentError(null)
    const res = await fetch(`/api/customers/${customer.id}/intent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: intentTier, flags: intentFlags, note: intentNote }),
    })
    const data = await res.json().catch(() => ({})) as { error?: string; intent?: ReturnType<typeof buildManualLeadIntent> }
    setIntentSaving(false)
    if (!res.ok || !data.intent) {
      setIntentError(data.error ?? 'Failed to save lead priority')
      return
    }
    setIntentSnapshot(data.intent)
    setIntentOpen(false)
    router.refresh()
  }

  const intentStyle = LEAD_INTENT_TIER_STYLES[intentSnapshot.tier]

  return (
    <div className="relative pb-36 lg:pb-6">
      {isMultiLocation && (
        <LeadLocationBlockingModal
          open={needsLocationBlock}
          customerId={customer.id}
          locations={locations}
          onLocationSet={handleLocationSet}
        />
      )}
      {/* Contact info header card */}
      <div className="bg-card border-b border-border px-4 py-4">
        {/* Phone — tappable */}
        <a href={`tel:${customer.primary_phone}`} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
          <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {formatPhone(customer.primary_phone)}
        </a>
        {(customer as Record<string, unknown>).secondary_phone && (
          <a href={`tel:${(customer as Record<string, unknown>).secondary_phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mt-0.5">
            <Phone className="h-4 w-4 flex-shrink-0 opacity-0" />
            {formatPhone(customer.secondary_phone)}
          </a>
        )}
        {/* Email — tappable */}
        {(customer as unknown as Record<string, unknown>).email && (
          <a href={`mailto:${String((customer as unknown as Record<string, unknown>).email)}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mt-0.5">
            <Mail className="h-4 w-4 flex-shrink-0" />
            {String((customer as unknown as Record<string, unknown>).email)}
          </a>
        )}

        {/* Vehicle interest */}
        <div className="mt-2">
          {primaryVehicle ? (
            <p className="text-sm font-semibold flex items-center gap-1.5">
              {primaryVehicle.year === 0 && primaryVehicle.make === "RE" ? primaryVehicle.model : `${primaryVehicle.year} ${primaryVehicle.make} ${primaryVehicle.model}`}
              {primaryVehicle.price ? ` - $${primaryVehicle.price.toLocaleString()}` : ''}
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setLinkVehicleOpen(true)}
                title="Add / change vehicle"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </p>
          ) : (
            <button
              className="text-sm text-primary hover:underline flex items-center gap-1"
              onClick={() => setLinkVehicleOpen(true)}
            >
              + Add vehicle
            </button>
          )}
        </div>

        {/* Lead source */}
        {(customer as unknown as Record<string, unknown>).lead_source && (
          <p className="text-xs text-muted-foreground mt-2">
            Source: <span className="font-medium capitalize">{String((customer as unknown as Record<string, unknown>).lead_source).replace(/_/g, ' ')}</span>
          </p>
        )}

        {/* Lead state + assignment */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium">Stage:</span>
            <LeadStateSelector
              customerId={customer.id}
              currentState={customer.thread_state ?? 'new_lead'}
            />
          </div>
          {isMultiLocation && (
            <LeadLocationBadge
              customerId={customer.id}
              locationId={leadLocationId}
              locationName={leadLocationName}
              locations={locations}
              onLocationSet={handleLocationSet}
              locationShortCode={leadLocationShortCode}
            />
          )}
          {isAdmin && (
            <AssignDropdown
              customerId={customer.id}
              assignedTo={customer.assigned_to}
              orgOwnerName={orgOwnerName}
              leadLocationId={leadLocationId}
              isMultiLocation={isMultiLocation}
              locationBlocked={needsLocationBlock}
              compact
            />
          )}
        </div>
        {customer.sms_opt_out && (
          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5 w-fit">
            <MessageSquareOff className="h-3.5 w-3.5 flex-shrink-0" />
            This customer asked to stop texts. You can&apos;t send SMS to this number.
          </div>
        )}
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {customer.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        {customer.notes && (
          <p className="text-sm text-muted-foreground mt-2 italic">{customer.notes}</p>
        )}
        {intentSnapshot.summary && (
          <p className={`text-xs mt-2 ${intentStyle.text}`}>
            {intentSnapshot.summary}
          </p>
        )}
      </div>

      <div className="hidden lg:flex px-4 py-3 gap-2 border-b bg-card">
        <CallButton customerId={customer.id} customerName={customer.name} phone={customer.primary_phone} className="flex-1" />
        <TemplatePicker customer={customer} vehicle={primaryVehicle} buttonClassName="flex-1" labelClassName="" locationBlocked={needsLocationBlock} />
        <EmailButton
          customer={customer}
          vehicle={primaryVehicle}
          onSent={() => {
            refreshActivities()
            track({ event: 'email_sent', props: { template_used: false } })
          }}
          replyContext={replyContext}
          onReplyComplete={() => setReplyContext(null)}
          buttonClassName="flex-1"
          labelClassName=""
          locationBlocked={needsLocationBlock}
        />
      </div>


      {/* Status actions — labeled, always visible */}
      <div className="px-4 py-2 flex gap-2 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={openArchivePanel}
          className="flex-1 gap-1.5 text-muted-foreground"
        >
          <Archive className="h-4 w-4" />Archive
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setSnoozeOpen(v => !v); setSnoozeDate(''); setSnoozeError(null) }}
          className="flex-1 gap-1.5 text-muted-foreground"
        >
          <Clock className="h-4 w-4" />Follow Up
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setIntentOpen(v => !v); setIntentError(null) }}
          className={`flex-1 gap-1.5 ${intentStyle.text}`}
        >
          <Flame className="h-4 w-4" />Priority
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSoldOpen(v => !v)}
          className={`flex-1 gap-1.5 ${customer.thread_state === 'sold' ? 'text-green-600 border-green-300' : 'text-muted-foreground'}`}
          disabled={customer.thread_state === 'sold'}
        >
          <Trophy className="h-4 w-4" />{customer.thread_state === 'sold' ? 'Sold' : 'Mark Sold'}
        </Button>
      </div>

      {/* Utility actions */}
      <div className="px-4 py-2 flex gap-1 border-b overflow-x-auto">
        <Button variant="ghost" size="sm" onClick={() => setTaskOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />Task
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)} className="gap-1.5">
          <FileText className="h-4 w-4" />Note
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setApptOpen(v => !v)} className="gap-1.5">
          <Clock className="h-4 w-4" />Appt
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setChecklistOpen(true)} className="gap-1.5 text-muted-foreground" title="Deal checklist">
          <ClipboardList className="h-4 w-4" />Docs
        </Button>
        {/* LinkVehicleSheet — headless, triggered from contact header */}
        <LinkVehicleSheet customerId={customer.id} onLinked={() => setVehicleRefreshKey(k => k + 1)} hasVehicle={!!primaryVehicle} open={linkVehicleOpen} onOpenChange={setLinkVehicleOpen} />
        <WantListSheet
          customerId={customer.id}
          customerName={customer.name}
          prefillVehicle={primaryVehicle ? {
            year: primaryVehicle.year,
            make: primaryVehicle.make,
            model: primaryVehicle.model,
            body_style: (primaryVehicle as unknown as Record<string, unknown>).body_style as string ?? null,
            price: primaryVehicle.price,
          } : null}
        />
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={() => setMergeOpen(true)} className="text-muted-foreground" title="Merge duplicate">
            <GitMerge className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setDeleteOpen(v => !v); setDeleteConfirm(''); setDeleteError(null) }}
          className="text-destructive"
          title="Delete contact"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Appointments list */}
      {upcomingAppointments.length > 0 && (
        <div className="mx-4 my-1 space-y-1">
          {upcomingAppointments.map((appt, idx) => {
            const isFirst = idx === 0
            return (
              <div
                key={appt.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  isFirst
                    ? 'border-purple-200/80 bg-purple-50/60 dark:border-purple-900/50 dark:bg-purple-950/20'
                    : 'border-border bg-muted/30'
                }`}
              >
                <CalendarClock className={`h-3.5 w-3.5 flex-shrink-0 ${isFirst ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`} />
                <span className={`font-medium ${isFirst ? 'text-purple-800 dark:text-purple-200' : 'text-foreground'}`}>
                  {new Date(appt.due_at!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}
                  {new Date(appt.due_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    title="Reschedule"
                    onClick={() => {
                      const dt = new Date(appt.due_at!)
                      const m = Math.round(dt.getMinutes() / 15) * 15
                      dt.setMinutes(m === 60 ? 0 : m, 0, 0)
                      if (m === 60) dt.setHours(dt.getHours() + 1)
                      const pad = (n: number) => String(n).padStart(2, '0')
                      setApptDatetime(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`)
                      setEditingApptId(appt.id)
                      setApptOpen(true)
                    }}
                    className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900/40 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    title="Delete appointment"
                    onClick={() => handleDeleteAppt(appt.id)}
                    disabled={deletingApptId === appt.id}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    {deletingApptId === appt.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Appointment picker */}
      {apptOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border bg-muted/40 space-y-2">
          <p className="text-sm font-medium">{editingApptId ? 'Reschedule appointment' : 'Schedule appointment'}</p>
          <DateTimePicker15 value={apptDatetime} onChange={setApptDatetime} />
          {apptError && (
            <p className="text-xs text-destructive">{apptError}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveAppt} disabled={!apptDatetime || apptSaving} className="flex-1">
              {apptSaving ? 'Saving…' : 'Confirm'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setApptOpen(false); setApptDatetime(''); setEditingApptId(null); setApptError(null) }}>Cancel</Button>
          </div>
        </div>
      )}

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

      {/* Snooze / Follow-up panel */}
      {snoozeOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Follow up on…</p>
            <button onClick={() => setSnoozeOpen(false)} title="Close">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['tomorrow', '3days', '1week', '2weeks'] as const).map(preset => {
              const labels = { tomorrow: 'Tomorrow', '3days': 'In 3 days', '1week': 'In 1 week', '2weeks': 'In 2 weeks' }
              return (
                <button
                  key={preset}
                  onClick={() => void handleSnooze(snoozePresetDate(preset))}
                  disabled={snoozing}
                  className="px-3 py-1.5 rounded-md border border-blue-300 bg-white text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {labels[preset]}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 items-center">
            <input
              aria-label="Snooze until date"
              type="date"
              value={snoozeDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setSnoozeDate(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!snoozeDate || snoozing}
              onClick={() => {
                const d = new Date(snoozeDate)
                d.setHours(8, 0, 0, 0)
                void handleSnooze(d.toISOString())
              }}
            >
              {snoozing ? 'Saving…' : 'Set date'}
            </Button>
          </div>
          {snoozeError && <p className="text-xs text-red-600">{snoozeError}</p>}
          <p className="text-xs text-muted-foreground">This lead will reappear in your queue on the selected date.</p>
        </div>
      )}

      {intentOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Lead priority</p>
            <button onClick={() => setIntentOpen(false)} title="Close">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['standard', 'active', 'warm', 'hot'] as LeadIntentTier[]).map(tier => (
              <button
                key={tier}
                onClick={() => setIntentTier(tier)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  intentTier === tier ? 'border-orange-500 bg-white text-orange-700' : 'border-orange-200 bg-white/70 text-muted-foreground'
                }`}
              >
                {LEAD_INTENT_TIER_LABELS[tier]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { flag: 'callback_requested' as LeadIntentFlag, label: 'Callback requested', icon: PhoneCall },
              { flag: 'appointment' as LeadIntentFlag, label: 'Appointment interest', icon: CalendarClock },
              { flag: 'reengaged' as LeadIntentFlag, label: 'Re-engaged', icon: RotateCcw },
              { flag: 'returning_shopper' as LeadIntentFlag, label: 'Strong interest', icon: Flame },
            ].map(item => {
              const Icon = item.icon
              const active = intentFlags.includes(item.flag)
              return (
                <button
                  key={item.flag}
                  onClick={() => toggleIntentFlag(item.flag)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border ${
                    active ? 'border-orange-500 bg-white text-orange-700' : 'border-orange-200 bg-white/70 text-muted-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>
          <Input
            placeholder="Optional note, e.g. asked for a callback after 5pm"
            value={intentNote}
            onChange={e => setIntentNote(e.target.value)}
            className="h-9 text-sm"
          />
          {intentError && <p className="text-xs text-destructive">{intentError}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={saveLeadIntent} disabled={intentSaving}>
              {intentSaving ? 'Saving…' : 'Save Priority'}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setIntentOpen(false)} disabled={intentSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Archive panel */}
      {archiveOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-destructive">Archive this lead?</p>
            <button onClick={() => { setArchiveOpen(false); setArchiveDocs([]); setArchiveReason('') }} title="Close">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Doc cleanup prompt */}
          {archiveDocsLoading && (
            <p className="text-xs text-muted-foreground">Checking for attached documents…</p>
          )}
          {!archiveDocsLoading && archiveDocs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {archiveDocs.length} document{archiveDocs.length !== 1 ? 's' : ''} attached — download or delete before archiving.
              </p>
              {archiveDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 p-2 rounded-md border bg-background text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">{doc.label}</span>
                  {doc.signed_url && (
                    <a href={doc.signed_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline flex-shrink-0">Open</a>
                  )}
                  <button
                    onClick={() => deleteArchiveDoc(doc.id)}
                    disabled={archiveDocDeleting === doc.id}
                    className="text-destructive flex-shrink-0 disabled:opacity-50 px-1"
                  >
                    {archiveDocDeleting === doc.id ? '…' : 'Del'}
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">You can also manage these in Settings → Document Storage.</p>
            </div>
          )}

          <Input
            placeholder="Reason (optional)"
            value={archiveReason}
            onChange={e => setArchiveReason(e.target.value)}
            className="h-9 text-sm"
          />
          {archiveError && (
            <p className="text-xs text-destructive">{archiveError}</p>
          )}
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

      {/* Delete panel */}
      {deleteOpen && (
        <div className="mx-4 my-2 p-3 rounded-lg border border-destructive bg-destructive/5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-destructive">Delete this contact permanently?</p>
            <button
              onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(null) }}
              title="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            This will remove this contact and related timeline/tasks from your CRM. Type <span className="font-semibold">DELETE</span> to confirm.
          </p>
          <Input
            aria-label="Type DELETE to confirm"
            placeholder="Type DELETE to confirm"
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            className="h-9 text-sm"
          />
          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleDelete}
            disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE'}
          >
            {deleting ? 'Deleting…' : 'Delete Contact'}
          </Button>
        </div>
      )}

      <AutoresponderCard
        customerId={customer.id}
        customerName={customer.name}
        unsubEmail={unsubEmail}
        unsubSms={unsubSms}
        savingUnsub={savingUnsub}
        onToggleUnsub={toggleUnsubscribe}
        autoOverride={autoOverride}
        savingAuto={savingAuto}
        onSetAutoOverride={setAutomationOverride}
        locationBlocked={needsLocationBlock}
      />

      <ScheduledOutreachCard activities={scheduledActivities} />

      <LinkedVehicles customerId={customer.id} refreshKey={vehicleRefreshKey} />

      {/* Tasks */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setTasksExpanded(!tasksExpanded)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-[#F07018] pl-2">
              Open tasks {localTasks.length > 0 && `(${localTasks.length})`}
            </h3>
            {localTasks.length > 0 && (
              <span className="text-xs text-muted-foreground/60">
                {tasksExpanded ? '▼' : '▶'}
              </span>
            )}
          </button>
          <button
            onClick={() => { setQuickTaskOpen(true); void loadTeamMembers() }}
            className="text-xs text-primary font-medium flex items-center gap-1"
            title="Add task"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {tasksExpanded && (
          <>
            {localTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No open tasks</p>
            ) : (
              <div className="space-y-1 mb-2">
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
          </>
        )}
        {quickTaskOpen && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                aria-label="Task title"
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 border-l-2 border-[#F07018] pl-2">Activity</h2>
        <ActivityTimeline activities={activities} currentUserId={currentUserId} isAdmin={isAdmin} onNoteUpdated={refreshActivities} onEmailReply={setReplyContext} />
      </div>

      {/* Sticky bottom action bar — mobile only, sits above BottomNav */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-card border-t border-border px-4 py-3 pb-safe flex gap-2">
        <CallButton customerId={customer.id} customerName={customer.name} phone={customer.primary_phone} className="flex-1" />
        <TemplatePicker customer={customer} vehicle={primaryVehicle} locationBlocked={needsLocationBlock} />
        <EmailButton
          customer={customer}
          vehicle={primaryVehicle}
          onSent={() => {
            refreshActivities()
            track({ event: 'email_sent', props: { template_used: false } })
          }}
          replyContext={replyContext}
          onReplyComplete={() => setReplyContext(null)}
          locationBlocked={needsLocationBlock}
        />
        <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)} className="flex-1 gap-1.5">
          <FileText className="h-4 w-4" />Note
        </Button>
      </div>

      <AddTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} customerId={customer.id} customerName={customer.name} vehicleId={primaryVehicle?.id} orgName={orgSettings.dealerName} orgPhone={orgSettings.dealerPhone} orgAddress={orgSettings.dealerAddress} onSaved={refreshActivities} />
      <AddNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} customerId={customer.id} onSaved={refreshActivities} />
      <AfterCallModal open={modalOpen} pendingCall={pendingCall} onDismiss={() => { dismissModal(); refreshActivities() }} />
      <DealChecklistSheet
        customerId={customer.id}
        customerName={customer.name}
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
      />
      <MergeCustomerSheet
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        sourceCustomer={{
          id: customer.id,
          name: customer.name,
          primary_phone: customer.primary_phone,
          email: customer.email,
        }}
      />
    </div>
  )
}
