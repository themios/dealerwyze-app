'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Calendar, MessageSquare, X } from 'lucide-react'
import Link from 'next/link'

interface Props {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string }
  }
  onUpdate: () => void
}

function toLocalDatetimeValue(d: Date): string {
  // Format: "YYYY-MM-DDTHH:MM" for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AppointmentRequestCard({ activity, onUpdate }: Props) {
  const customer = activity.customer
  if (!customer) return null

  // Pre-fill with detected date or tomorrow 10am
  const defaultDate = activity.due_at
    ? new Date(activity.due_at)
    : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d })()

  const [datetime, setDatetime] = useState(toLocalDatetimeValue(defaultDate))
  const [saving, setSaving] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const supabase = createClient()

  async function handleSchedule() {
    setSaving(true)
    // Confirm the appointment: set the due_at, clear direction so it shows in calendar
    await supabase
      .from('activities')
      .update({
        due_at: new Date(datetime).toISOString(),
        direction: null,       // no longer "inbound request" — now a real appointment
        outcome: 'pending',
        priority: 'high',
        body: `Test drive / appointment with ${customer.name}\n\nRequested: "${activity.body}"`,
      })
      .eq('id', activity.id)
    setSaving(false)
    onUpdate()
  }

  async function handleDismiss() {
    setDismissing(true)
    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString(), outcome: 'answered' })
      .eq('id', activity.id)
    setDismissing(false)
    onUpdate()
  }

  return (
    <div className="rounded-lg border-2 border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div>
            <Link href={`/customers/${customer.id}`} className="font-semibold text-sm hover:underline">
              {customer.name}
            </Link>
            <p className="text-xs text-muted-foreground">Appointment request</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {activity.body && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <p className="italic">"{activity.body}"</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {activity.due_at ? 'Suggested time — adjust if needed:' : 'Set appointment date & time:'}
        </p>
        <input
          type="datetime-local"
          value={datetime}
          onChange={e => setDatetime(e.target.value)}
          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
        />
      </div>

      <Button
        className="w-full h-9 gap-2"
        onClick={handleSchedule}
        disabled={saving || !datetime}
      >
        <Calendar className="h-3.5 w-3.5" />
        {saving ? 'Scheduling…' : 'Add to Calendar'}
      </Button>
    </div>
  )
}
