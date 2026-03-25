'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { PIPELINE_STATES, LEAD_STATE_CONFIG, LEAD_STATES, type LeadState } from '@/lib/leads/states'
import { formatPhone } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChevronRight, Flame } from 'lucide-react'

interface PipelineCustomer {
  id: string
  name: string
  primary_phone: string | null
  thread_state: string | null
  lead_state_changed_at: string | null
  created_at: string
  lead_source: string | null
  lead_rating?: string | null
}

interface Props {
  customers: PipelineCustomer[]
  lastActivityMap?: Record<string, string>
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function urgencyBorderClass(lastActivityAt: string | undefined): string {
  if (!lastActivityAt) return 'border-l-gray-300'
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3600000
  if (hours < 24) return 'border-l-green-400'
  if (hours < 72) return 'border-l-yellow-400'
  return 'border-l-red-400'
}

function urgencyDotClass(lastActivityAt: string | undefined): string {
  if (!lastActivityAt) return 'bg-gray-300'
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3600000
  if (hours < 24) return 'bg-green-400'
  if (hours < 72) return 'bg-yellow-400'
  return 'bg-red-400'
}

function PipelineCard({
  customer,
  lastActivity,
  isDragging,
  onDragStart,
  onMoveClick,
}: {
  customer: PipelineCustomer
  lastActivity: string | undefined
  isDragging: boolean
  onDragStart: (id: string) => void
  onMoveClick: (id: string) => void
}) {
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(customer.id) }}
      className={`rounded-xl border-l-4 bg-card p-3 space-y-1 cursor-grab active:cursor-grabbing shadow-sm transition-opacity ${urgencyBorderClass(lastActivity)} ${isDragging ? 'opacity-40 scale-95' : 'hover:bg-accent'}`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/customers/${customer.id}`}
          className="block flex-1 min-w-0"
          draggable={false}
        >
          <p className="text-sm font-medium leading-tight truncate flex items-center gap-1">
            {customer.lead_rating === 'hot' && <Flame className="h-3 w-3 text-orange-500 flex-shrink-0" />}
            {customer.name}
          </p>
          {customer.primary_phone && (
            <p className="text-xs text-muted-foreground">{formatPhone(customer.primary_phone)}</p>
          )}
        </Link>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onMoveClick(customer.id) }}
          className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0 mt-0.5"
          title="Move to stage"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {customer.lead_source && (
          <span className="text-[10px] text-muted-foreground truncate">{customer.lead_source}</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full ${urgencyDotClass(lastActivity)}`} />
          <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
            {timeAgo(customer.lead_state_changed_at ?? customer.created_at)}
          </span>
        </div>
      </div>
    </div>
  )
}

function PipelineColumn({
  state, customers, lastActivityMap, draggingId, isDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onMoveClick,
}: {
  state: LeadState
  customers: PipelineCustomer[]
  lastActivityMap: Record<string, string>
  draggingId: string | null
  isDragOver: boolean
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent, state: LeadState) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, state: LeadState) => void
  onMoveClick: (id: string) => void
}) {
  const cfg = LEAD_STATE_CONFIG[state]
  return (
    <div
      className={`w-52 flex-shrink-0 flex flex-col gap-2 p-1.5 rounded-xl transition-colors ${isDragOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
      onDragOver={e => onDragOver(e, state)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, state)}
    >
      <div className="flex items-center gap-2 px-1">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground">{customers.length}</span>
      </div>
      <div className={`flex flex-col gap-2 min-h-[60px] rounded-lg transition-colors ${isDragOver ? 'bg-primary/5' : ''}`}>
        {customers.length === 0 ? (
          <div className={`rounded-xl border border-dashed p-3 text-center transition-colors ${isDragOver ? 'border-primary/40 bg-primary/5' : 'bg-card/50'}`}>
            <p className="text-[10px] text-muted-foreground">{isDragOver ? 'Drop here' : 'None'}</p>
          </div>
        ) : (
          customers.map(c => (
            <PipelineCard
              key={c.id}
              customer={c}
              lastActivity={lastActivityMap[c.id]}
              isDragging={draggingId === c.id}
              onDragStart={onDragStart}
              onMoveClick={onMoveClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default function PipelineBoard({ customers: initial, lastActivityMap = {} }: Props) {
  const [customers, setCustomers] = useState<PipelineCustomer[]>(initial)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverState, setDragOverState] = useState<LeadState | null>(null)
  const [movePickerCustomer, setMovePickerCustomer] = useState<string | null>(null)
  const [savingMove, setSavingMove] = useState(false)
  const dragLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const byState = Object.fromEntries(
    PIPELINE_STATES.map(s => [s, customers.filter(c => (c.thread_state ?? 'new_lead') === s)])
  ) as Record<LeadState, PipelineCustomer[]>

  function handleDragStart(id: string) { setDraggingId(id) }

  function handleDragOver(e: React.DragEvent, state: LeadState) {
    e.preventDefault()
    if (dragLeaveTimer.current) { clearTimeout(dragLeaveTimer.current); dragLeaveTimer.current = null }
    setDragOverState(state)
  }

  function handleDragLeave() {
    dragLeaveTimer.current = setTimeout(() => setDragOverState(null), 60)
  }

  function handleDrop(e: React.DragEvent, state: LeadState) {
    e.preventDefault()
    if (!draggingId) return
    const id = draggingId
    setDraggingId(null)
    setDragOverState(null)
    if ((customers.find(c => c.id === id)?.thread_state ?? 'new_lead') === state) return
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, thread_state: state } : c))
    fetch(`/api/customers/${id}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    })
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverState(null)
  }

  async function handleMoveStage(newState: string) {
    if (!movePickerCustomer || savingMove) return
    setSavingMove(true)
    const id = movePickerCustomer
    setMovePickerCustomer(null)
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, thread_state: newState } : c))
    await fetch(`/api/customers/${id}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState }),
    })
    setSavingMove(false)
  }

  return (
    <>
      {/* Urgency legend */}
      <div className="px-4 pt-2 pb-0 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-400" /> Active &lt;24h</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /> 24-72h</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Stale &gt;72h</span>
        <span className="hidden lg:inline opacity-60">Drag cards to move stage. Tap the arrow to move on mobile.</span>
      </div>

      <div
        className="flex gap-3 overflow-x-auto px-4 py-3 pb-24 min-h-[calc(100dvh-140px)] items-start"
        onDragEnd={handleDragEnd}
      >
        {PIPELINE_STATES.map(state => (
          <PipelineColumn
            key={state}
            state={state}
            customers={byState[state] ?? []}
            lastActivityMap={lastActivityMap}
            draggingId={draggingId}
            isDragOver={dragOverState === state}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onMoveClick={setMovePickerCustomer}
          />
        ))}
      </div>

      {/* Stage picker sheet for mobile */}
      <Sheet open={!!movePickerCustomer} onOpenChange={o => { if (!o) setMovePickerCustomer(null) }}>
        <SheetContent side="bottom" className="rounded-t-2xl h-auto pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">
              Move — {customers.find(c => c.id === movePickerCustomer)?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-1">
            {LEAD_STATES.map(s => {
              const cfg = LEAD_STATE_CONFIG[s]
              const isCurrent = (customers.find(c => c.id === movePickerCustomer)?.thread_state ?? 'new_lead') === s
              return (
                <button
                  key={s}
                  disabled={savingMove}
                  onClick={() => handleMoveStage(s)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${isCurrent ? 'bg-muted font-semibold' : 'hover:bg-accent'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color.split(' ')[0]}`} />
                    <span className="text-sm">{cfg.label}</span>
                  </div>
                  {isCurrent && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
