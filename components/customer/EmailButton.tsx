'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, Vehicle } from '@/types'
import { fillTemplate } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Mail } from 'lucide-react'

const EMAIL_TEMPLATES = [
  {
    name: 'First Contact',
    subject: 'Re: {vehicle} — Apollo Auto',
    body: 'Hi {firstName},\n\nThank you for your interest in the {vehicle}! It\'s available and in great condition.\n\nWould you like to schedule a test drive? I have availability this week.\n\nBest,\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Appointment Confirmation',
    subject: 'Your Appointment at Apollo Auto — {date}',
    body: 'Hi {firstName},\n\nThis confirms your appointment on {date} at {time} to see the {vehicle}.\n\nWe\'re located in Simi Valley. See you then!\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Thank You for Visit',
    subject: 'Great meeting you, {firstName}!',
    body: 'Hi {firstName},\n\nIt was great meeting you today! I hope you enjoyed seeing the {vehicle}.\n\nLet me know if you have any questions or would like to move forward.\n\nBest,\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Financing Documents',
    subject: 'Documents Needed — Apollo Auto',
    body: 'Hi {firstName},\n\nTo proceed with financing on the {vehicle}, I\'ll need:\n\n• Driver\'s license\n• Proof of insurance\n• Proof of income (2 recent pay stubs)\n• Proof of residence\n\nFeel free to bring these to our next appointment.\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Lost Lead Reactivation',
    subject: 'Still looking for a vehicle, {firstName}?',
    body: 'Hi {firstName},\n\nI wanted to reach out — are you still in the market for a vehicle? I have some new inventory that might interest you.\n\nWould love to help you find the right fit.\n\nBest,\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Price Drop Alert',
    subject: 'Price Update on {vehicle} — Apollo Auto',
    body: 'Hi {firstName},\n\nGood news! I\'ve reduced the price on the {vehicle} to {price}.\n\nThis is a great opportunity — let me know if you\'d like to take another look.\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Trade-In Follow-Up',
    subject: 'Your Trade-In Value — Apollo Auto',
    body: 'Hi {firstName},\n\nI wanted to follow up on your trade-in. I can offer you a fair market value and apply it toward any vehicle on our lot.\n\nWould you like to come in for a quick appraisal?\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Waiting on Decision',
    subject: 'Checking in — {vehicle}',
    body: 'Hi {firstName},\n\nJust checking in to see if you\'ve had a chance to think about the {vehicle}.\n\nI\'m happy to answer any questions or work on the numbers with you.\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Vehicle Sold — Similar Available',
    subject: 'Update on {vehicle} — Apollo Auto',
    body: 'Hi {firstName},\n\nI wanted to let you know the {vehicle} has sold. However, I have a very similar vehicle available that you might like.\n\nInterested? I can send you details.\n\nApollo Auto\n(805) 404-3873',
  },
  {
    name: 'Test Drive Reminder',
    subject: 'Test Drive Tomorrow — Apollo Auto',
    body: 'Hi {firstName},\n\nJust a reminder about your test drive tomorrow at {time} for the {vehicle}.\n\nSee you then! If anything comes up, you can reach me at (805) 404-3873.\n\nApollo Auto',
  },
]

interface EmailButtonProps {
  customer: Customer
  vehicle?: Vehicle
}

export default function EmailButton({ customer, vehicle }: EmailButtonProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<typeof EMAIL_TEMPLATES[0] | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const supabase = createClient()

  function getVars(): Record<string, string> {
    const firstName = customer.name.split(' ')[0]
    return {
      firstName,
      vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '{vehicle}',
      price: vehicle?.price ? `$${vehicle.price.toLocaleString()}` : '{price}',
      date: '{date}', time: '{time}',
    }
  }

  function selectTemplate(t: typeof EMAIL_TEMPLATES[0]) {
    const vars = getVars()
    setSelected(t)
    setSubject(fillTemplate(t.subject, vars))
    setBody(fillTemplate(t.body, vars))
  }

  async function handleSend() {
    await supabase.from('activities').insert({
      type: 'email',
      direction: 'outbound',
      customer_id: customer.id,
      vehicle_id: vehicle?.id ?? null,
      body: `Subject: ${subject}\n\n${body}`,
      completed_at: new Date().toISOString(),
      priority: 'normal',
    })
    const mailto = `mailto:${customer.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
    setOpen(false)
    setSelected(null)
  }

  return (
    <>
      <Button variant="outline" size="lg" className="border-[#0D2B55] text-[#0D2B55] hover:bg-[#0D2B55]/10" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-2" />
        Email
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>Email {customer.name}</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="space-y-2">
              {EMAIL_TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => selectTemplate(t)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <button className="text-sm text-primary" onClick={() => setSelected(null)}>← Back</button>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-11"
              />
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                className="resize-none text-sm"
              />
              <Button className="w-full h-11" onClick={handleSend}>
                Open in Gmail
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
