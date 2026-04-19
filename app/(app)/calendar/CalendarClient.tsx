'use client'

import { CalendarDays, User, ExternalLink, Clock } from 'lucide-react'

interface DbAppointment {
  id:                       string
  due_at:                   string | null
  body:                     string | null
  google_calendar_event_id: string | null
  customer: { id: string; name: string; primary_phone: string } | null
}

interface GcalEvent {
  id:          string
  summary:     string
  description: string | null
  startIso:    string
  endIso:      string
  htmlLink:    string | null
}

interface Props {
  appointments: DbAppointment[]
  gcalOnly:     GcalEvent[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

export default function CalendarClient({ appointments, gcalOnly }: Props) {
  const hasAny = appointments.length > 0 || gcalOnly.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">No upcoming appointments</p>
        <p className="text-sm text-muted-foreground mt-1">
          Appointment requests from the Today page will appear here once confirmed.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-2 space-y-3">
      {appointments.map(appt => (
        <div key={appt.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="font-medium text-sm truncate">
                {appt.customer?.name ?? 'Unknown customer'}
              </span>
            </div>
            {appt.google_calendar_event_id && (
              <span title="On Google Calendar"><CalendarDays className="h-4 w-4 text-green-500 flex-shrink-0" /></span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{appt.due_at ? formatDate(appt.due_at) : 'Time not set'}</span>
          </div>
          {appt.body && (
            <p className="text-xs text-muted-foreground italic line-clamp-2">&ldquo;{appt.body}&rdquo;</p>
          )}
          {appt.customer?.primary_phone && (
            <a href={`tel:${appt.customer.primary_phone}`} className="text-xs text-blue-500 hover:underline">
              {appt.customer.primary_phone}
            </a>
          )}
        </div>
      ))}

      {gcalOnly.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground pt-2 font-medium uppercase tracking-wide">
            Other calendar events
          </p>
          {gcalOnly.map(ev => (
            <div key={ev.id} className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm truncate">{ev.summary}</span>
                {ev.htmlLink && (
                  <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formatDate(ev.startIso)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
