'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import AddAppointmentSheet from '@/components/calendar/AddAppointmentSheet'
import { useOrgSettings } from '@/hooks/useOrgSettings'
import { useAnalytics } from '@/hooks/useAnalytics'

type ViewMode = 'month' | 'week' | 'day'

interface CalEvent {
  id: string
  type: string
  body?: string
  due_at: string
  completed_at?: string
  customer?: { id: string; name: string }
}

const TYPE_COLOR: Record<string, string> = {
  appointment: 'bg-blue-500',
}

function isoDate(d: Date) {
  // Use local date parts — toISOString() is UTC and shifts late-evening events to the next day
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfWeek(d: Date) {
  const day = new Date(d)
  day.setDate(day.getDate() - day.getDay())
  return day
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatHeader(view: ViewMode, current: Date) {
  if (view === 'month') return current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (view === 'week') {
    const start = startOfWeek(current)
    const end = addDays(start, 6)
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
    }
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return current.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function CalendarPage() {
  // Default to 'day' view on mobile (more readable), 'month' on desktop
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'month'
    return window.innerWidth < 768 ? 'day' : 'month'
  })
  const [current, setCurrent] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addDefaultDate, setAddDefaultDate] = useState<Date | undefined>()
  const supabase = createClient()
  const orgSettings = useOrgSettings()
  const { track } = useAnalytics()

  const loadEvents = useCallback(async () => {
    let start: Date, end: Date
    if (view === 'month') {
      start = new Date(current.getFullYear(), current.getMonth(), 1)
      end = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59)
    } else if (view === 'week') {
      start = startOfWeek(current)
      end = addDays(start, 6)
      end.setHours(23, 59, 59)
    } else {
      start = new Date(current)
      start.setHours(0, 0, 0, 0)
      end = new Date(current)
      end.setHours(23, 59, 59)
    }

    const params = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
    })
    const res = await fetch(`/api/calendar/unified-events?${params}`)
    if (res.ok) {
      const data = (await res.json()) as {
        events?: Array<{ id: string; title: string; subtitle: string | null; start: string }>
      }
      setEvents(
        (data.events ?? []).map((e) => ({
          id: e.id,
          type: 'appointment',
          body: e.subtitle ? `${e.title}\n${e.subtitle}` : e.title,
          due_at: e.start,
        })),
      )
      return
    }

    const { data } = await supabase
      .from('activities')
      .select('id, type, body, due_at, completed_at, customer:customers(id, name)')
      .eq('type', 'appointment')
      .is('customer_sequence_id', null)
      .not('due_at', 'is', null)
      .gte('due_at', start.toISOString())
      .lte('due_at', end.toISOString())
      .order('due_at', { ascending: true })

    setEvents((data as unknown as CalEvent[]) || [])
  }, [view, current, supabase])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  // Reload when tab regains focus — catches appointments added from another screen
  useEffect(() => {
    const handleFocus = () => loadEvents()
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadEvents() }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadEvents])

  function navigate(dir: -1 | 1) {
    const d = new Date(current)
    if (view === 'month') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCurrent(d)
  }

  // Group events by date string
  const eventsByDate = new Map<string, CalEvent[]>()
  for (const e of events) {
    const key = isoDate(new Date(e.due_at))
    if (!eventsByDate.has(key)) eventsByDate.set(key, [])
    eventsByDate.get(key)!.push(e)
  }

  const todayStr = isoDate(new Date())

  function openAdd(date?: Date) {
    setAddDefaultDate(date)
    setAddOpen(true)
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title="Calendar"
        right={
          <Button variant="ghost" size="sm" onClick={() => openAdd()} title="Add appointment">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* View switcher + navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-2 border-b flex-shrink-0 gap-2 sm:gap-0">
        <div className="flex gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-10 sm:h-7 min-h-[44px] sm:min-h-auto px-2 capitalize min-w-[44px] sm:min-w-auto"
              onClick={() => {
                setView(v)
                track({ event: 'calendar_viewed', props: { view: v } })
              }}
            >
              {v}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 w-full sm:w-auto">
          <Button variant="ghost" size="sm" className="h-10 sm:h-7 min-h-[44px] sm:min-h-auto w-10 sm:w-7 min-w-[44px] sm:min-w-auto p-0" onClick={() => navigate(-1)} title={`Previous ${view}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-0 text-center px-1 truncate flex-1 sm:flex-none" suppressHydrationWarning>
            {formatHeader(view, current)}
          </span>
          <Button variant="ghost" size="sm" className="h-10 sm:h-7 min-h-[44px] sm:min-h-auto w-10 sm:w-7 min-w-[44px] sm:min-w-auto p-0" onClick={() => navigate(1)} title={`Next ${view}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="text-xs h-10 sm:h-7 min-h-[44px] sm:min-h-auto px-2 w-full sm:w-auto" onClick={() => setCurrent(new Date())}>
          Today
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'month' && (
          <MonthView current={current} eventsByDate={eventsByDate} todayStr={todayStr} onDayClick={d => { setCurrent(d); setView('day') }} />
        )}
        {view === 'week' && (
          <WeekView current={current} eventsByDate={eventsByDate} todayStr={todayStr} onDayClick={d => { setCurrent(d); setView('day') }} />
        )}
        {view === 'day' && (
          <DayView events={eventsByDate.get(isoDate(current)) || []} onAdd={() => openAdd(current)} />
        )}
      </div>

      <AddAppointmentSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDate={addDefaultDate}
        onSaved={loadEvents}
        orgName={orgSettings.dealerName}
      />
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────
function MonthView({ current, eventsByDate, todayStr, onDayClick }: {
  current: Date
  eventsByDate: Map<string, CalEvent[]>
  todayStr: string
  onDayClick: (d: Date) => void
}) {
  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDay).fill(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i))

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1.5 font-medium">{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} className="border-b border-r min-h-[56px]" />
          const key = isoDate(d)
          const dayEvents = eventsByDate.get(key) || []
          const isToday = key === todayStr
          return (
            <div
              key={key}
              className="border-b border-r min-h-[56px] p-1 cursor-pointer hover:bg-accent/50"
              onClick={() => onDayClick(d)}
            >
              <div className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
              )}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <div key={e.id} className={cn('text-[10px] rounded px-1 py-0.5 truncate text-white', TYPE_COLOR[e.type] || 'bg-gray-400')}>
                    {formatTime(e.due_at)} {e.customer?.name || e.type}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ────────────────────────────────────────────────
function WeekView({ current, eventsByDate, todayStr, onDayClick }: {
  current: Date
  eventsByDate: Map<string, CalEvent[]>
  todayStr: string
  onDayClick: (d: Date) => void
}) {
  const weekStart = startOfWeek(current)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div>
      <div className="grid grid-cols-7 border-b">
        {days.map(d => {
          const key = isoDate(d)
          const isToday = key === todayStr
          return (
            <div key={key} className="text-center py-2 border-r last:border-r-0 cursor-pointer hover:bg-accent/50" onClick={() => onDayClick(d)}>
              <div className="text-xs text-muted-foreground" suppressHydrationWarning>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className={cn(
                'text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mx-auto mt-0.5',
                isToday ? 'bg-primary text-primary-foreground' : ''
              )}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 divide-x">
        {days.map(d => {
          const key = isoDate(d)
          const dayEvents = eventsByDate.get(key) || []
          return (
            <div key={key} className="min-h-[300px] p-1 space-y-1 cursor-pointer hover:bg-accent/20" onClick={() => onDayClick(d)}>
              {dayEvents.map(e => (
                <div key={e.id} className={cn('text-[10px] rounded px-1 py-1 text-white', TYPE_COLOR[e.type] || 'bg-gray-400', e.completed_at && 'opacity-50')}>
                  <div className="font-medium">{formatTime(e.due_at)}</div>
                  <div className="truncate">{e.customer?.name || e.type}</div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Day View ────────────────────────────────────────────────
function DayView({ events, onAdd }: {
  events: CalEvent[]
  onAdd: () => void
}) {
  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-3xl mb-3">📅</p>
        <p className="text-sm">No events scheduled</p>
        <button onClick={onAdd} className="mt-4 text-sm text-primary underline">+ Add appointment</button>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-2 pb-6">
      {events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm mb-3">No events scheduled</p>
        </div>
      ) : (
        <>
          {events.map(e => (
            <div key={e.id} className={cn('flex gap-3 p-3 rounded-lg border', e.completed_at && 'opacity-50')}>
              <div className={cn('w-1.5 rounded-full flex-shrink-0 self-stretch', TYPE_COLOR[e.type] || 'bg-gray-400')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium capitalize">
                    {e.type === 'sms' ? 'Text' : e.type}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(e.due_at)}</span>
                </div>
                {e.customer && (
                  <Link href={`/customers/${e.customer.id}`} className="text-xs text-primary mt-0.5 block hover:underline">
                    {e.customer.name}
                  </Link>
                )}
                {e.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.body}</p>}
                {e.completed_at && <p className="text-xs text-green-600 mt-1">Completed</p>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
