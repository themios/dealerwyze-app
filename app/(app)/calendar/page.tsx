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
  task: 'bg-orange-500',
  call: 'bg-green-500',
  sms: 'bg-purple-500',
  email: 'bg-yellow-500',
  note: 'bg-gray-400',
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
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
  const [view, setView] = useState<ViewMode>('month')
  const [current, setCurrent] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addDefaultDate, setAddDefaultDate] = useState<Date | undefined>()
  const supabase = createClient()
  const orgSettings = useOrgSettings()

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

    const { data } = await supabase
      .from('activities')
      .select('id, type, body, due_at, completed_at, customer:customers(id, name)')
      .not('due_at', 'is', null)
      .gte('due_at', start.toISOString())
      .lte('due_at', end.toISOString())
      .order('due_at', { ascending: true })

    setEvents((data as unknown as CalEvent[]) || [])
  }, [view, current, supabase])

  useEffect(() => { loadEvents() }, [loadEvents])

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
          <Button variant="ghost" size="sm" onClick={() => openAdd()}>
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* View switcher + navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <div className="flex gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-2 capitalize"
              onClick={() => setView(v)}
            >
              {v}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-0 text-center px-1 truncate max-w-[140px]" suppressHydrationWarning>
            {formatHeader(view, current)}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setCurrent(new Date())}>
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
          <DayView date={current} events={eventsByDate.get(isoDate(current)) || []} todayStr={todayStr} onAdd={() => openAdd(current)} />
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
function DayView({ date, events, todayStr, onAdd }: {
  date: Date
  events: CalEvent[]
  todayStr: string
  onAdd: () => void
}) {
  const isToday = isoDate(date) === todayStr

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
    <div className="px-4 py-3 space-y-2">
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
      <button
        onClick={onAdd}
        className="w-full py-2.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        + Add appointment
      </button>
    </div>
  )
}
