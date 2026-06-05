'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UnifiedCalendarEvent } from '@/app/api/calendar/unified-events/route'

function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  /** Bump to refetch (e.g. after confirming a showing). */
  refreshKey?: number
  className?: string
}

export default function EmbeddedCalendarPanel({ refreshKey = 0, className }: Props) {
  const [current, setCurrent] = useState(() => new Date())
  const [events, setEvents] = useState<UnifiedCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const start = new Date(current.getFullYear(), current.getMonth(), 1)
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59)
    try {
      const params = new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
      })
      const res = await fetch(`/api/calendar/unified-events?${params}`)
      if (res.ok) {
        const data = (await res.json()) as { events?: UnifiedCalendarEvent[] }
        setEvents(data.events ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const eventsByDate = new Map<string, UnifiedCalendarEvent[]>()
  for (const e of events) {
    const key = isoDate(new Date(e.start))
    if (!eventsByDate.has(key)) eventsByDate.set(key, [])
    eventsByDate.get(key)!.push(e)
  }

  const todayStr = isoDate(new Date())
  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDay).fill(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i))

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px]"
            onClick={() => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[120px] text-center" suppressHydrationWarning>
            {current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-h-[44px] min-w-[44px]"
            onClick={() => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setCurrent(new Date())}
          >
            Today
          </Button>
        </div>
        <Link href="/calendar" className="text-xs text-primary hover:underline">
          Full calendar →
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground px-3 py-4">Loading calendar…</p>
      ) : (
        <>
          <div className="grid grid-cols-7 border-b">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-[10px] text-muted-foreground py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={`e-${i}`} className="border-b border-r min-h-[52px]" />
              const key = isoDate(d)
              const dayEvents = eventsByDate.get(key) || []
              const isToday = key === todayStr
              return (
                <div key={key} className="border-b border-r min-h-[52px] p-0.5">
                  <div
                    className={cn(
                      'text-[10px] font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5',
                      isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) =>
                      e.href ? (
                        <Link
                          key={e.id}
                          href={e.href}
                          className={cn(
                            'block text-[9px] rounded px-0.5 py-0.5 truncate text-white hover:opacity-90',
                            e.color,
                          )}
                          title={e.title}
                        >
                          {formatTime(e.start)} {e.title.split('—')[0]?.trim()}
                        </Link>
                      ) : (
                        <div
                          key={e.id}
                          className={cn('text-[9px] rounded px-0.5 py-0.5 truncate text-white', e.color)}
                          title={e.title}
                        >
                          {formatTime(e.start)} {e.title}
                        </div>
                      ),
                    )}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-muted-foreground pl-0.5">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 px-3 py-2 border-t text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Appointments
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" /> Confirmed showings
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-600" /> Scheduled showings
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending requests
            </span>
          </div>
        </>
      )}
    </div>
  )
}
