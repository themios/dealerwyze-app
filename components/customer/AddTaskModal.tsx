'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { in2hours, tomorrow9am } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { CalendarPlus } from 'lucide-react'

interface AddTaskModalProps {
  open: boolean
  onClose: () => void
  customerId: string
  customerName?: string
  vehicleId?: string
  orgName?: string
  orgPhone?: string
  orgAddress?: string
  onSaved: () => void
}

type DuePreset = '2h' | 'tomorrow' | 'custom' | null

export default function AddTaskModal({ open, onClose, customerId, customerName, vehicleId, orgName = '', orgPhone = '', orgAddress = '', onSaved }: AddTaskModalProps) {
  const [type, setType] = useState<'call' | 'task' | 'appointment'>('call')
  const [body, setBody] = useState('')
  const [duePreset, setDuePreset] = useState<DuePreset>('tomorrow')
  const [customDate, setCustomDate] = useState('')
  const [priority, setPriority] = useState<'high' | 'normal'>('normal')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  function getDueAt(): Date | null {
    if (duePreset === '2h') return in2hours()
    if (duePreset === 'tomorrow') return tomorrow9am()
    if (duePreset === 'custom' && customDate) return new Date(customDate)
    return null
  }

  async function handleSave() {
    setSaving(true)
    const dueAt = getDueAt()
    await supabase.from('activities').insert({
      type,
      customer_id: customerId,
      vehicle_id: vehicleId ?? null,
      body: body || null,
      due_at: dueAt?.toISOString() ?? null,
      priority,
    })
    setSaving(false)
    setBody('')
    setDuePreset('tomorrow')
    onSaved()
    onClose()
  }

  function openGoogleCalendar() {
    const dueAt = getDueAt()
    if (!dueAt) return

    const endAt = new Date(dueAt.getTime() + 60 * 60 * 1000) // +1 hour
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0]

    const title = customerName
      ? `Appointment — ${customerName}${orgName ? ` @ ${orgName}` : ''}`
      : `Appointment${orgName ? ` @ ${orgName}` : ''}`

    const details = [body, orgPhone ? `${orgName} | ${orgPhone}` : orgName].filter(Boolean).join('\n')

    const url = new URL('https://calendar.google.com/calendar/render')
    url.searchParams.set('action', 'TEMPLATE')
    url.searchParams.set('text', title)
    url.searchParams.set('dates', `${fmt(dueAt)}/${fmt(endAt)}`)
    url.searchParams.set('details', details)
    if (orgAddress) url.searchParams.set('location', orgAddress)

    window.open(url.toString(), '_blank')
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl h-auto max-h-[80vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Add Task</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(['call', 'task', 'appointment'] as const).map(t => (
                <Button
                  key={t}
                  variant={type === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setType(t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="What needs to happen…"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Due</Label>
            <div className="flex flex-wrap gap-2">
              {([['2h', 'In 2 hours'], ['tomorrow', 'Tomorrow 9am'], ['custom', 'Custom']] as const).map(([key, label]) => (
                <Badge
                  key={key}
                  variant={duePreset === key ? 'default' : 'outline'}
                  className="cursor-pointer px-3 py-1.5 text-sm"
                  onClick={() => setDuePreset(duePreset === key ? null : key)}
                >
                  {label}
                </Badge>
              ))}
            </div>
            {duePreset === 'custom' && (
              <input
                type="datetime-local"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <div className="flex gap-2">
              {(['normal', 'high'] as const).map(p => (
                <Button
                  key={p}
                  variant={priority === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPriority(p)}
                  className="capitalize"
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          <Button className="w-full h-11" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add Task'}
          </Button>

          {type === 'appointment' && getDueAt() && (
            <Button
              variant="outline"
              className="w-full h-10 text-sm gap-2"
              onClick={openGoogleCalendar}
            >
              <CalendarPlus className="h-4 w-4" />
              Add to Google Calendar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
