'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ExternalLink, CalendarCheck } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  defaultDate?: Date
  orgName?: string
  onSaved: () => void
}

interface CustomerOption {
  id: string
  name: string
  primary_phone: string
}

/** Build a Google Calendar "Add Event" URL — no API key needed */
function googleCalendarUrl(title: string, start: Date, durationMins: number, description: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const end = new Date(start.getTime() + durationMins * 60 * 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: description,
    location: '',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AddAppointmentSheet({ open, onClose, defaultDate, orgName = '', onSaved }: Props) {
  const defaultDt = defaultDate ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d
  })()

  const [datetime, setDatetime] = useState(toLocalDatetimeValue(defaultDt))
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selected, setSelected] = useState<CustomerOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedGCalUrl, setSavedGCalUrl] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase
      .from('customers')
      .select('id, name, primary_phone')
      .order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [open, supabase])

  // Reset when opened
  useEffect(() => {
    if (open) {
      const dt = defaultDate ?? (() => {
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d
      })()
      setDatetime(toLocalDatetimeValue(dt))
      setNotes('')
      setSearch('')
      setSelected(null)
      setSavedGCalUrl(null)
      setSaving(false)
    }
  }, [open, defaultDate])

  const filtered = search.length > 1
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 5)
    : []

  async function handleSave() {
    if (!datetime) return
    setSaving(true)

    const startDate = new Date(datetime)
    const title = selected
      ? `Test drive / appointment with ${selected.name}`
      : notes || 'Appointment'

    const { data: { user } } = await supabase.auth.getUser()

    // Get org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user!.id)
      .single()

    await supabase.from('activities').insert({
      user_id: profile?.org_id ?? user!.id,
      customer_id: selected?.id ?? null,
      type: 'appointment',
      direction: null,
      outcome: 'pending',
      priority: 'high',
      body: [title, notes].filter(Boolean).join('\n'),
      due_at: startDate.toISOString(),
      completed_at: null,
    })

    const gcalUrl = googleCalendarUrl(
      title,
      startDate,
      parseInt(duration) || 60,
      notes || ''
    )

    setSaving(false)
    setSavedGCalUrl(gcalUrl)
    onSaved()
  }

  function handleClose() {
    setSavedGCalUrl(null)
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
        <SheetHeader className="mb-3 flex-shrink-0">
          <SheetTitle>New Appointment</SheetTitle>
        </SheetHeader>

        {savedGCalUrl ? (
          /* Post-save state */
          <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center">
            <CalendarCheck className="h-12 w-12 text-green-500" />
            <div>
              <p className="font-semibold">Appointment saved!</p>
              <p className="text-sm text-muted-foreground mt-1">It now appears in the calendar.</p>
            </div>
            <a
              href={savedGCalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary underline"
            >
              <ExternalLink className="h-4 w-4" />
              Add to Google Calendar
            </a>
            <Button variant="outline" className="mt-2" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 space-y-4 overflow-y-auto">
            {/* Customer search */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Customer (optional)</p>
              {selected ? (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5">
                  <div>
                    <p className="font-medium text-sm">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">{selected.primary_phone}</p>
                  </div>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSelected(null); setSearch('') }}>
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Search customer…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {filtered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 bg-card border rounded-lg mt-1 shadow-lg overflow-hidden">
                      {filtered.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelected(c); setSearch('') }}
                          className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
                        >
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.primary_phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Date & Time */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date & Time</p>
              <input
                type="datetime-local"
                value={datetime}
                onChange={e => setDatetime(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background"
              />
            </div>

            {/* Duration */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <div className="flex gap-2">
                {['30', '60', '90', '120'].map(m => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      duration === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m === '60' ? '1 hr' : m === '90' ? '1.5 hr' : m === '120' ? '2 hr' : '30 min'}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes (optional)</p>
              <Textarea
                placeholder="e.g. Test drive 2022 Honda Civic, bring ID"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="resize-none text-sm"
                rows={3}
              />
            </div>

            <Button
              className="w-full h-11 flex-shrink-0"
              onClick={handleSave}
              disabled={saving || !datetime}
            >
              {saving ? 'Saving…' : 'Save Appointment'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
