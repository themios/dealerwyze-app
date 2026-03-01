'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, Vehicle } from '@/types'
import { fillTemplate, formatPhoneForTel } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { MessageSquare, Send, Zap } from 'lucide-react'

const SMS_TEMPLATES = [
  // First contact
  { category: 'First Contact', name: 'Thanks for stopping by', body: 'Hi {firstName}! Thanks for stopping by Apollo Auto today. The {vehicle} is still available. Any questions? — Tim' },
  { category: 'First Contact', name: 'New lead response', body: 'Hi {firstName}, this is Tim at Apollo Auto. I saw your inquiry about the {vehicle} — it\'s available! When works for a test drive?' },
  { category: 'First Contact', name: 'Share listing link', body: 'Hi {firstName}! Here\'s the direct link to the {vehicle}: {link} — Any questions? — Tim' },
  { category: 'First Contact', name: 'Online inquiry response', body: 'Hi {firstName}! The {vehicle} at {price} is available. Clean title, great condition. Want to come take a look?' },

  // Follow-up
  { category: 'Follow-Up', name: 'Checking in', body: 'Hi {firstName}, just checking in — still interested in the {vehicle}? Happy to answer any questions.' },
  { category: 'Follow-Up', name: 'Follow-up #2', body: 'Hey {firstName}! Wanted to follow up on the {vehicle}. It\'s been getting attention — let me know if you\'d like to move forward.' },
  { category: 'Follow-Up', name: 'Still looking?', body: 'Hi {firstName}, are you still in the market? I have some great options at Apollo Auto that might work for you.' },
  { category: 'Follow-Up', name: 'Last follow-up', body: 'Hi {firstName}, I\'ll stop reaching out after this — just wanted to make sure you hadn\'t missed out on the {vehicle}. Still available at {price}!' },

  // Pricing
  { category: 'Pricing', name: 'Price drop alert', body: 'Good news {firstName}! I dropped the price on the {vehicle} to {price}. Want to take another look?' },
  { category: 'Pricing', name: 'Best offer', body: 'Hi {firstName}, I want to earn your business. What would it take to make the {vehicle} work for you today?' },
  { category: 'Pricing', name: 'Financing available', body: 'Hi {firstName}! We have financing options on the {vehicle}. Low down payments available. Want to run some numbers?' },

  // Appointments
  { category: 'Appointments', name: 'Appointment confirmed', body: 'Hi {firstName}, your appointment is confirmed for {date} at {time} to see the {vehicle}. See you then! — Apollo Auto' },
  { category: 'Appointments', name: 'Test drive reminder', body: 'Hi {firstName}, reminder: test drive tomorrow at {time} for the {vehicle}. See you then! Call if anything changes: (805) 404-3873' },
  { category: 'Appointments', name: 'Schedule test drive', body: 'Hi {firstName}, when works best for a test drive on the {vehicle}? I\'m available weekdays and Saturdays.' },

  // Trade-in
  { category: 'Trade-In', name: 'Trade-in follow-up', body: 'Hi {firstName}, following up on your trade-in. I can give you a quick appraisal — bring it by anytime this week!' },
  { category: 'Trade-In', name: 'Trade offer', body: 'Hi {firstName}, I looked up your trade and I can work with it. Want to come in and run the numbers on the {vehicle}?' },

  // Post-sale / other
  { category: 'Other', name: 'Similar vehicle available', body: 'Hi {firstName}, the {vehicle} sold but I have something very similar. Interested in details?' },
  { category: 'Other', name: 'New inventory alert', body: 'Hi {firstName}! Just got a {vehicle} in at {price} — thought of you. Want more info?' },
  { category: 'Other', name: 'Waiting on docs', body: 'Hi {firstName}, just a reminder — I still need your {document} to move forward. Let me know when you can send it over!' },
  { category: 'Other', name: 'Thank you', body: 'Hi {firstName}, great meeting you today! Enjoy the new car. Reach out anytime — Tim at Apollo Auto (805) 404-3873' },
  { category: 'Other', name: 'Request review', body: 'Hi {firstName}, hope you\'re loving the car! If you have a moment, a Google review would mean a lot: [link]. Thanks! — Apollo Auto' },
]

interface TemplatePickerProps {
  customer: Customer
  vehicle?: Vehicle
}

export default function TemplatePicker({ customer, vehicle }: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const supabase = createClient()

  const twilioEnabled = process.env.NEXT_PUBLIC_TWILIO_ENABLED === 'true'

  function getVars(): Record<string, string> {
    const firstName = customer.name.split(' ')[0]
    return {
      firstName,
      vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '{vehicle}',
      price: vehicle?.price ? `$${vehicle.price.toLocaleString()}` : '{price}',
      date: '{date}', time: '{time}', document: '{document}',
      link: vehicle?.listing_url ?? '[listing link not set]',
    }
  }

  function selectTemplate(name: string, tmplBody: string) {
    setSelected(name)
    setBody(fillTemplate(tmplBody, getVars()))
    setSearch('')
    setSendError(null)
  }

  async function logActivity() {
    await supabase.from('activities').insert({
      type: 'sms',
      direction: 'outbound',
      customer_id: customer.id,
      vehicle_id: vehicle?.id ?? null,
      body,
      priority: 'normal',
      completed_at: new Date().toISOString(),
    })
  }

  async function handleOpenMessages() {
    await logActivity()
    const tel = formatPhoneForTel(customer.primary_phone)
    window.location.href = `sms:${tel}?body=${encodeURIComponent(body)}`
    setOpen(false)
    setSelected(null)
    setBody('')
  }

  async function handleSendTwilio() {
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customer.primary_phone,
          body,
          customer_id: customer.id,
          vehicle_id: vehicle?.id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')

      setOpen(false)
      setSelected(null)
      setBody('')
    } catch (err: any) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  const categories = [...new Set(SMS_TEMPLATES.map(t => t.category))]
  const filtered = search ? SMS_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.body.toLowerCase().includes(search.toLowerCase())
  ) : SMS_TEMPLATES

  return (
    <>
      <Button variant="outline" size="lg" className="border-[#F07018] text-[#F07018] hover:bg-[#F07018]/10" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4 mr-2" />
        Text
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>Text {customer.name}</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="flex flex-col flex-1 min-h-0">
              <Input
                placeholder="Search templates…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="mb-3 flex-shrink-0"
              />
              <div className="overflow-y-auto flex-1 space-y-4">
                {search ? (
                  <div className="space-y-2">
                    {filtered.map(t => (
                      <button key={t.name} onClick={() => selectTemplate(t.name, t.body)}
                        className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors">
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  categories.map(cat => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>
                      <div className="space-y-2">
                        {SMS_TEMPLATES.filter(t => t.category === cat).map(t => (
                          <button key={t.name} onClick={() => selectTemplate(t.name, t.body)}
                            className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors">
                            <p className="font-medium text-sm">{t.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.body}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <button className="text-sm text-primary text-left flex-shrink-0" onClick={() => { setSelected(null); setBody('') }}>← Back to templates</button>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                className="resize-none flex-1"
              />
              {sendError && (
                <p className="text-xs text-destructive flex-shrink-0">{sendError}</p>
              )}
              <div className="flex gap-2 flex-shrink-0">
                <Button className="flex-1 h-11 gap-2" onClick={handleOpenMessages}>
                  <MessageSquare className="h-4 w-4" />
                  Open Messages
                </Button>
                {twilioEnabled && (
                  <Button
                    variant="outline"
                    className="flex-1 h-11 gap-2"
                    onClick={handleSendTwilio}
                    disabled={sending}
                  >
                    <Zap className="h-4 w-4" />
                    {sending ? 'Sending…' : 'Send Now'}
                  </Button>
                )}
              </div>
              {twilioEnabled && (
                <p className="text-xs text-center text-muted-foreground flex-shrink-0">
                  "Send Now" delivers immediately via Twilio
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
