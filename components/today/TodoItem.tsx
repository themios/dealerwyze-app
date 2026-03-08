'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import DateTimePicker15 from '@/components/ui/DateTimePicker15'

export interface Task {
  id: string
  title: string
  task_type: 'lead_response' | 'lead_followup' | 'appointment_confirm' | 'inventory_review' | 'receipt_review' | 'manual'
  status: 'open' | 'done'
  priority: 'must' | 'should'
  due_at: string | null
  snooze_until: string | null
  linked_customer_id: string | null
  linked_vehicle_id: string | null
  linked_receipt_id: string | null
  notes: string | null
  last_action: string | null
  auto_generated: boolean
  created_at: string
  completed_at: string | null
  assigned_to_user_id: string | null
  assigned_to_name: string | null
  vehicles: { stock_no: string; year: number; make: string; model: string } | null
  receipts: { vendor_norm: string | null; vendor_raw: string | null; total: number | null } | null
  customers: { name: string; primary_phone: string | null } | null
}

interface Props {
  task: Task
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  onUpdate: (id: string, patch: Partial<Task>) => void
}

// ── Due time helpers ──────────────────────────────────────────────────────────

function formatDue(due: string | null): { label: string; cls: string } {
  if (!due) return { label: 'someday', cls: 'text-muted-foreground/50' }
  const now = Date.now()
  const dueMs = new Date(due).getTime()
  const diffMs = dueMs - now

  if (diffMs < 0) {
    const minsAgo = Math.round(-diffMs / 60000)
    const hoursAgo = Math.round(-diffMs / 3600000)
    const label = minsAgo < 60 ? `overdue ${minsAgo}m` : `overdue ${hoursAgo}h`
    return { label, cls: 'text-red-500' }
  }
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.round(diffMs / 60000)
    return { label: `in ${mins}m`, cls: 'text-amber-500' }
  }

  const dueDate = new Date(due)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  if (dueDate <= todayEnd) {
    const h = dueDate.getHours()
    const m = dueDate.getMinutes()
    const ampm = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 || 12
    const label = m === 0 ? `today ${h12}${ampm}` : `today ${h12}:${String(m).padStart(2, '0')}${ampm}`
    return { label, cls: 'text-muted-foreground' }
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const h = dueDate.getHours()
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return { label: `${days[dueDate.getDay()]} ${h12}${ampm}`, cls: 'text-muted-foreground' }
}

function isOverdue(due: string | null): boolean {
  if (!due) return false
  return new Date(due).getTime() < Date.now()
}

/** Strip redundant "Respond to " prefix so Must Do shows the actual task (e.g. "John Smith · 2022 Honda") */
function displayTitle(title: string): string {
  const prefix = 'Respond to '
  return title.startsWith(prefix) ? title.slice(prefix.length) : title
}

// ── Entity pill ───────────────────────────────────────────────────────────────

function EntityPill({ task }: { task: Task }) {
  let text: string | null = null

  if (task.task_type === 'inventory_review' && task.vehicles) {
    text = `\u{1F4E6} ${task.vehicles.stock_no}`
  } else if (task.task_type === 'receipt_review' && task.receipts) {
    const vendor = task.receipts.vendor_norm ?? task.receipts.vendor_raw
    if (vendor) text = `\u{1F9FE} ${vendor}`
  } else if (task.task_type === 'manual') {
    if (task.vehicles) {
      text = `\u{1F697} ${task.vehicles.stock_no}`
    } else if (task.customers) {
      text = `\u{1F464} ${task.customers.name}`
    }
  }

  if (!text) return null

  return (
    <span className="mt-0.5 inline-block text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground truncate max-w-[160px]">
      {text}
    </span>
  )
}

// ── Detail sheet ──────────────────────────────────────────────────────────────

interface DetailSheetProps {
  task: Task
  onClose: () => void
  onComplete: () => void
  onSnooze: () => void
  onUpdate: (patch: Partial<Task>) => void
  onDelete: () => void
}

function DetailSheet({ task, onClose, onComplete, onSnooze, onUpdate, onDelete }: DetailSheetProps) {
  const [notes, setNotes] = useState(task.notes ?? '')
  const [dueAt, setDueAt] = useState(
    task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : ''
  )
  const [priority, setPriority] = useState<'must' | 'should'>(task.priority)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([])
  const [assignedTo, setAssignedTo] = useState<string>(task.assigned_to_user_id ?? '')

  useEffect(() => {
    fetch('/api/org/members')
      .then(r => r.json())
      .then((d: { members: { id: string; display_name: string }[] }) => setMembers(d.members ?? []))
  }, [])

  async function handleAssign(userId: string) {
    setAssignedTo(userId)
    const assignee = members.find(m => m.id === userId)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to_user_id: userId || null }),
    })
    onUpdate({
      assigned_to_user_id: userId || null,
      assigned_to_name: assignee?.display_name ?? null,
    })
  }

  async function handleNotesSave() {
    if (notes === (task.notes ?? '')) return
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    onUpdate({ notes })
    setSaving(false)
  }

  async function handleDueChange(val: string) {
    setDueAt(val)
    const due_at = val ? new Date(val).toISOString() : null
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_at }),
    })
    onUpdate({ due_at })
  }

  async function handlePriorityToggle(p: 'must' | 'should') {
    if (p === priority) return
    setPriority(p)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: p }),
    })
    onUpdate({ priority: p })
  }

  async function handleDelete() {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onDelete()
    onClose()
  }

  // Entity details card
  let entityCard: React.ReactNode = null
  if (task.vehicles) {
    entityCard = (
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <div className="text-xs text-muted-foreground mb-0.5">Vehicle</div>
        <div className="font-medium">{task.vehicles.year} {task.vehicles.make} {task.vehicles.model}</div>
        <div className="text-xs text-muted-foreground">Stock #{task.vehicles.stock_no}</div>
      </div>
    )
  } else if (task.receipts) {
    const vendor = task.receipts.vendor_norm ?? task.receipts.vendor_raw
    entityCard = (
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <div className="text-xs text-muted-foreground mb-0.5">Receipt</div>
        <div className="font-medium">{vendor ?? 'Unknown vendor'}</div>
        {task.receipts.total != null && (
          <div className="text-xs text-muted-foreground">${task.receipts.total.toFixed(2)}</div>
        )}
      </div>
    )
  } else if (task.customers) {
    entityCard = (
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <div className="text-xs text-muted-foreground mb-0.5">Customer</div>
        <div className="font-medium">{task.customers.name}</div>
        {task.customers.primary_phone && (
          <div className="text-xs text-muted-foreground">{task.customers.primary_phone}</div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      {/* Sheet */}
      <div className="relative bg-background rounded-t-2xl max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto px-4 pt-4 pb-8">
        {/* Drag handle */}
        <div className="mx-auto w-10 h-1 rounded-full bg-muted mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold leading-snug pr-6">{displayTitle(task.title)}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Entity card */}
        {entityCard && <div className="mb-3">{entityCard}</div>}

        {/* Due date/time */}
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Due
          </label>
          <DateTimePicker15 value={dueAt} onChange={handleDueChange} />
        </div>

        {/* Priority toggle */}
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Priority
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handlePriorityToggle('must')}
              className={`flex-1 rounded-md border py-1.5 text-sm font-medium transition-colors ${
                priority === 'must'
                  ? 'bg-destructive text-destructive-foreground border-destructive'
                  : 'bg-background text-muted-foreground border-border hover:border-destructive'
              }`}
            >
              Must Do
            </button>
            <button
              onClick={() => handlePriorityToggle('should')}
              className={`flex-1 rounded-md border py-1.5 text-sm font-medium transition-colors ${
                priority === 'should'
                  ? 'bg-muted text-foreground border-border'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground'
              }`}
            >
              Should Do
            </button>
          </div>
        </div>

        {/* Assigned To */}
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Assigned To
          </label>
          <select
            value={assignedTo}
            onChange={e => void handleAssign(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F07018]"
          >
            <option value="">Unassigned</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Notes {saving && <span className="normal-case tracking-normal font-normal">(saving…)</span>}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleNotesSave}
            rows={3}
            placeholder="Add a note…"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#F07018]"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onComplete}
            className="flex-1 rounded-md bg-green-600 hover:bg-green-700 text-white py-2 text-sm font-medium transition-colors"
          >
            Mark Done
          </button>
          <button
            onClick={onSnooze}
            className="flex-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-medium transition-colors"
          >
            Snooze 2h
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md border border-destructive text-destructive hover:bg-destructive/10 px-3 py-2 text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main TodoItem ─────────────────────────────────────────────────────────────

export default function TodoItem({ task, onComplete, onSnooze, onUpdate }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const [flashClass, setFlashClass] = useState('')
  const [translateX, setTranslateX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const trackingSwipe = useRef(false)

  const { label: dueLabel, cls: dueCls } = formatDue(task.due_at)
  const overdue = isOverdue(task.due_at)
  const snoozed = task.snooze_until ? new Date(task.snooze_until).getTime() > Date.now() : false

  const dotColor = snoozed
    ? 'bg-gray-400'
    : task.priority === 'must' || overdue
    ? 'bg-red-500'
    : 'bg-amber-400'

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    trackingSwipe.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    if (!trackingSwipe.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      if (Math.abs(dy) > Math.abs(dx)) return // vertical scroll wins
      trackingSwipe.current = true
      setIsSwiping(true)
    }

    if (!trackingSwipe.current) return
    e.preventDefault()
    const clamped = Math.max(-110, Math.min(110, dx))
    setTranslateX(clamped)
  }

  async function handleTouchEnd() {
    const dx = translateX

    if (!trackingSwipe.current) {
      // It was a tap
      setIsSwiping(false)
      setShowDetail(true)
      return
    }

    trackingSwipe.current = false
    setIsSwiping(false)

    if (dx < -70) {
      // Swipe left → complete
      setFlashClass('bg-green-500')
      setTranslateX(0)
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      setTimeout(() => onComplete(task.id), 350)
    } else if (dx > 70) {
      // Swipe right → snooze
      setFlashClass('bg-blue-500')
      setTranslateX(0)
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snooze_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
      })
      setTimeout(() => onSnooze(task.id), 350)
    } else {
      setTranslateX(0)
    }
  }

  async function handleComplete() {
    setShowDetail(false)
    setFlashClass('bg-green-500')
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    setTimeout(() => onComplete(task.id), 350)
  }

  async function handleSnooze() {
    setShowDetail(false)
    setFlashClass('bg-blue-500')
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snooze_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
    })
    setTimeout(() => onSnooze(task.id), 350)
  }

  function handleDelete() {
    setDeleted(true)
  }

  if (deleted) return null

  return (
    <>
      {/* Swipe container */}
      <div className="relative overflow-hidden">
        {/* Swipe backgrounds */}
        {isSwiping && (
          <>
            {/* Right background (complete) - shown when swiping left */}
            <div className="absolute inset-0 flex items-center justify-end pr-4 bg-green-500">
              <span className="text-white text-sm font-semibold">Done</span>
            </div>
            {/* Left background (snooze) - shown when swiping right */}
            <div className="absolute inset-0 flex items-center justify-start pl-4 bg-blue-500">
              <span className="text-white text-sm font-semibold">Snooze 2h</span>
            </div>
          </>
        )}

        {/* Row */}
        <div
          className={`relative flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${flashClass || 'bg-card'}`}
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.25s ease, background-color 0.35s ease',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => {
            if (!isSwiping) setShowDetail(true)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowDetail(true) }}
          aria-label={`Task: ${displayTitle(task.title)}`}
        >
          {/* Priority dot */}
          <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${dotColor}`} aria-hidden="true" />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{displayTitle(task.title)}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <EntityPill task={task} />
              {task.assigned_to_name && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold shrink-0" title={task.assigned_to_name}>
                  {task.assigned_to_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Due + chevron — label is time-relative (e.g. "in 5m") so suppress hydration mismatch */}
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-xs ${dueCls}`} suppressHydrationWarning>{dueLabel}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Detail bottom sheet */}
      {showDetail && (
        <DetailSheet
          task={task}
          onClose={() => setShowDetail(false)}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
          onUpdate={patch => onUpdate(task.id, patch)}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
