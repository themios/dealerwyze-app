'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Calendar, MessageSquare, X } from 'lucide-react'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'
import DateTimePicker15 from '@/components/ui/DateTimePicker15'

interface Props {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string; email?: string | null }
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
  const openCustomer = useOpenCustomer()

  const handleCardClick = () => openCustomer(activity.id, customer.id)

  // Pre-fill with detected date or tomorrow 10am
  const defaultDate = activity.due_at
    ? new Date(activity.due_at)
    : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d })()

  const [datetime, setDatetime] = useState(toLocalDatetimeValue(defaultDate))
  const [saving, setSaving] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  if (!customer) return null

  async function handleSchedule() {
    setSaving(true)
    try {
      const res = await fetch('/api/appointments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id:    activity.id,
          datetime:       datetime,
          customer_id:    customer.id,
          customer_name:  customer.name,
          customer_phone: customer.primary_phone,
          customer_email: customer.email ?? '',
          original_body:  activity.body ?? '',
        }),
      })
      if (!res.ok) {
        console.error('[AppointmentRequestCard] confirm failed', await res.text())
      }
    } catch (err) {
      console.error('[AppointmentRequestCard] confirm error:', err)
    } finally {
      setSaving(false)
      onUpdate()
    }
  }

  async function handleDismiss() {
    setDismissing(true)
    const supabase = createClient()
    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString(), outcome: 'answered' })
      .eq('id', activity.id)
    setDismissing(false)
    onUpdate()
  }

  return (
    <div className="rounded-[10px] border-2 border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-90 min-w-0 flex-1"
          onClick={handleCardClick}
          onKeyDown={e => e.key === 'Enter' && handleCardClick()}
          role="button"
          tabIndex={0}
          aria-label={`Open ${customer.name}`}
        >
          <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">{customer.name}</p>
            <p className="text-xs text-muted-foreground">Appointment request</p>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); handleDismiss() }}
          disabled={dismissing}
          className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {activity.body && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <p className="italic">&quot;{activity.body}&quot;</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {activity.due_at ? 'Suggested time — adjust if needed:' : 'Set appointment date & time:'}
        </p>
        <DateTimePicker15 value={datetime} onChange={setDatetime} />
      </div>

      <Button
        className="w-full h-10 gap-2"
        onClick={handleSchedule}
        disabled={saving || !datetime}
      >
        <Calendar className="h-3.5 w-3.5" />
        {saving ? 'Scheduling…' : 'Add to Calendar'}
      </Button>
    </div>
  )
}
