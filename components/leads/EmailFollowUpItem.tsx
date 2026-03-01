'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { tomorrow9am, fillTemplate } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail } from 'lucide-react'

const FOLLOWUP_TEMPLATES: Record<number, { subject: string; body: string }> = {
  3: {
    subject: '{vehicle} — Still Available',
    body: 'Hi {firstName},\n\nThe {vehicle} is still available. We also offer competitive financing with low down payments.\n\nWould love to help you find the right terms.\n\nTim\nApollo Auto | (805) 404-3873',
  },
  4: {
    subject: '{vehicle} — Getting Attention',
    body: 'Hi {firstName},\n\nJust a heads up — the {vehicle} has been getting attention from other buyers. I\'d hate for you to miss out.\n\nWant to lock in a test drive this week?\n\nTim\nApollo Auto | (805) 404-3873',
  },
  5: {
    subject: 'Last Note — {vehicle}',
    body: 'Hi {firstName},\n\nThis will be my last follow-up. The {vehicle} is still available if you\'re interested.\n\nIf now\'s not the right time, no worries — feel free to reach out whenever you\'re ready.\n\nTim\nApollo Auto | (805) 404-3873',
  },
}

interface Props {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string; email?: string }
  }
  onUpdate: () => void
}

function parseFollowUpBody(raw: string): {
  to: string; subject: string; body: string; sequence_day: number; vehicle: string; customer_name: string
} | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function EmailFollowUpItem({ activity, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  const data = parseFollowUpBody(activity.body || '')
  const day = data?.sequence_day ?? 2
  const firstName = data?.customer_name?.split(' ')[0] ?? ''
  const isOverdue = activity.due_at && new Date(activity.due_at) < new Date()

  if (!data) return null

  function openSheet() {
    setSubject(data?.subject ?? '')
    setEmailBody(data?.body ?? '')
    setOpen(true)
  }

  async function handleSend() {
    if (!data?.to) return
    setLoading('send')

    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activity.id)

    await supabase.from('activities').insert({
      user_id: activity.user_id,
      customer_id: activity.customer_id,
      type: 'email',
      direction: 'outbound',
      outcome: 'pending',
      priority: 'normal',
      body: `Subject: ${subject}\n\n${emailBody}`,
      completed_at: new Date().toISOString(),
      sequence_day: day,
    })

    const nextDay = day + 1
    if (nextDay <= 5 && FOLLOWUP_TEMPLATES[nextDay]) {
      const vars = { firstName, vehicle: data.vehicle }
      const nextTpl = FOLLOWUP_TEMPLATES[nextDay]
      const nextBody = JSON.stringify({
        to: data.to,
        subject: fillTemplate(nextTpl.subject, vars),
        body: fillTemplate(nextTpl.body, vars),
        sequence_day: nextDay,
        customer_name: data.customer_name,
        vehicle: data.vehicle,
      })

      await supabase.from('activities').insert({
        user_id: activity.user_id,
        customer_id: activity.customer_id,
        type: 'email',
        direction: 'outbound',
        outcome: 'pending',
        priority: 'normal',
        body: nextBody,
        due_at: tomorrow9am().toISOString(),
        sequence_day: nextDay,
      })
    }

    window.open(
      `mailto:${data.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`,
      '_blank'
    )

    setLoading(null)
    setOpen(false)
    onUpdate()
  }

  async function handleReplied() {
    setLoading('replied')
    // Mark this and stop — just complete this task
    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activity.id)
    setLoading(null)
    onUpdate()
  }

  return (
    <>
      <div className={`rounded-lg border bg-card p-4 space-y-3 ${isOverdue ? 'border-destructive/40' : ''}`}>
        <div className="flex items-start gap-3">
          <Mail className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-medium text-sm">Follow-up #{day}</p>
              <Badge variant="outline" className="text-xs">{data.vehicle}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{data.customer_name}</p>
            {activity.due_at && (
              <p className={`text-xs mt-1 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {isOverdue ? 'Overdue · ' : 'Due · '}
                {new Date(activity.due_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-9" onClick={openSheet} disabled={loading !== null}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Send Follow-up
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-9 text-xs"
            onClick={handleReplied}
            disabled={loading !== null}
          >
            {loading === 'replied' ? '…' : 'Replied ✓'}
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>Follow-up #{day} — {firstName}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col flex-1 min-h-0 space-y-3">
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-11 flex-shrink-0"
            />
            <Textarea
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              className="resize-none flex-1 text-sm"
            />
            <Button className="w-full h-11 flex-shrink-0" onClick={handleSend} disabled={loading !== null}>
              {loading === 'send' ? '…' : day < 5 ? `Send & Queue Day ${day + 1}` : 'Send (Final)'}
            </Button>
            <p className="text-xs text-center text-muted-foreground flex-shrink-0">
              Opens Gmail · {day < 5 ? `Day ${day + 1} queued for tomorrow` : 'This is the final follow-up'}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
