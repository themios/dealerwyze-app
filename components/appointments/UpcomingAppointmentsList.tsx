'use client'

import Link from 'next/link'
import { memo } from 'react'
import { CalendarClock, ChevronRight } from 'lucide-react'

export interface UpcomingAppointmentItem {
  id: string
  due_at: string
  body?: string | null
  customer?: { id?: string; name?: string | null; primary_phone?: string | null } | null
}

interface Props {
  title: string
  appointments: UpcomingAppointmentItem[]
  compact?: boolean
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, tomorrow)) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Memoize to prevent re-renders when parent updates but appointments haven't changed
export default memo(function UpcomingAppointmentsList({ title, appointments, compact = false }: Props) {
  if (appointments.length === 0) return null

  return (
    <div className={`rounded-xl border bg-card ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Calendar <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {appointments.map(appt => (
          <Link
            key={appt.id}
            href={appt.customer?.id ? `/customers/${appt.customer.id}` : '/calendar'}
            className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 hover:bg-accent/40 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{appt.customer?.name ?? 'Appointment'}</p>
              {appt.body && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{appt.body}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-medium text-blue-700">{dayLabel(appt.due_at)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(appt.due_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
})
