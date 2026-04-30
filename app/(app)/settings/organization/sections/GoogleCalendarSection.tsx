'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

export default function GoogleCalendarSection() {
  const [calendarConnected, setCalendarConnected] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('calendar') === 'connected'
  })

  useEffect(() => {
    fetch('/api/settings/org')
      .then(r => r.json())
      .then(d => {
        setCalendarConnected(!!d.calendar_connected)
      })

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('calendar') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleCalendarDisconnect() {
    await fetch('/api/google/calendar-disconnect', { method: 'DELETE' })
    setCalendarConnected(false)
  }

  return (
    <div className="px-4 pt-2 border-t">
      <p className="text-sm font-semibold mb-3">Google Calendar</p>
      {calendarConnected ? (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm font-medium">Connected</p>
              <p className="text-xs text-muted-foreground">Appointments sync to Google Calendar</p>
            </div>
          </div>
          <ConfirmActionDialog
            title="Disconnect Google Calendar?"
            description="Appointments will no longer sync to Google Calendar until it is reconnected."
            confirmLabel="Disconnect"
            confirmVariant="destructive"
            onConfirm={handleCalendarDisconnect}
            trigger={(
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 text-xs">
                Disconnect
              </Button>
            )}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Connect to sync appointment bookings to Google Calendar.</p>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/api/google/calendar-connect">
              <Calendar className="h-4 w-4" />
              Connect Google Calendar
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
