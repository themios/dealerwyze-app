'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail } from 'lucide-react'


interface Props {
  activity: Activity & {
    customer: { id: string; name: string; primary_phone: string; email?: string }
  }
  onUpdate: () => void
  hasResponded?: boolean
}

function parseFollowUpBody(raw: string): {
  to: string; subject: string; body: string; sequence_day: number; vehicle: string; customer_name: string;
  sequence_name?: string; step_total?: number; include_unsubscribe_footer?: boolean
} | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function EmailFollowUpItem({ activity, onUpdate, hasResponded }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()
  const openCustomer = useOpenCustomer()

  const data = parseFollowUpBody(activity.body || '')
  const day = data?.sequence_day ?? 2
  const stepTotal = data?.step_total
  const sequenceName = data?.sequence_name
  const firstName = data?.customer_name?.split(' ')[0] ?? ''
  const isOverdue = activity.due_at && new Date(activity.due_at) < new Date()
  const isSmsFollowup = activity.type === 'sms_followup'
  const followUpTitle = sequenceName && stepTotal
    ? `Follow-up ${day} of ${stepTotal} - ${sequenceName}`
    : `Follow-up #${day}`

  if (!data) return null

  function openSheet() {
    setSubject(data?.subject ?? '')
    setEmailBody(data?.body ?? '')
    setOpen(true)
  }

  async function handleSend() {
    if (!data?.to) return
    setLoading('send')

    // Send via API (logs outbound activity automatically)
    const sendRes = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: activity.customer_id,
        subject,
        emailBody,
        include_unsubscribe_footer: data?.include_unsubscribe_footer ?? false,
        customer_id_for_unsub: activity.customer_id,
      }),
    })
    if (!sendRes.ok) {
      const errData = await sendRes.json().catch(() => ({}))
      alert(errData.error ?? 'Could not send email.')
      setLoading(null)
      return
    }

    // Mark this queued activity as completed
    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activity.id)

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

  const customerId = activity.customer?.id
  const handleCardClick = () => {
    if (customerId) openCustomer(activity.id, customerId)
  }

  return (
    <>
      <div className={`card-hover rounded-[10px] border p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${hasResponded ? 'border-green-500 bg-green-50/60 dark:bg-green-950/20' : isOverdue ? 'border-destructive/40 bg-card' : 'border-border bg-card'}`}>
        {hasResponded && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-semibold">
            <span>●</span>
            <span>Customer replied - cancel sequence or respond</span>
          </div>
        )}
        <div
          className="flex items-start gap-3 cursor-pointer hover:opacity-90"
          onClick={handleCardClick}
          onKeyDown={e => e.key === 'Enter' && handleCardClick()}
          role="button"
          tabIndex={0}
          aria-label={`Open ${data.customer_name}`}
        >
          <Mail className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-medium text-sm">{followUpTitle}</p>
              <Badge variant="outline" className="text-xs">{data.vehicle}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{data.customer_name}</p>
            {activity.due_at && (
              <p className={`text-xs mt-1 ${isOverdue ? 'text-[#F07018] font-semibold' : 'text-muted-foreground'}`} suppressHydrationWarning>
                {isOverdue ? 'Due now · ' : 'Due · '}
                {new Date(activity.due_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {!isSmsFollowup && (
            <Button size="sm" className="flex-1 h-10" onClick={openSheet} disabled={loading !== null}>
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Send follow-up
            </Button>
          )}
          {isSmsFollowup && (
            <Button size="sm" variant="outline" className="flex-1 h-9" disabled>
              SMS (manual send from customer page)
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-10 text-xs"
            onClick={handleReplied}
            disabled={loading !== null}
          >
            {loading === 'replied' ? '…' : 'Replied ✓'}
          </Button>
          {hasResponded && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-xs border-green-500 text-green-700"
              onClick={async () => {
                setLoading('cancel')
                await supabase
                  .from('activities')
                  .update({ completed_at: new Date().toISOString(), outcome: 'cancelled' })
                  .eq('id', activity.id)
                setLoading(null)
                onUpdate()
              }}
              disabled={loading !== null}
            >
              {loading === 'cancel' ? '…' : 'Cancel Sequence'}
            </Button>
          )}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="mb-3 flex-shrink-0">
            <SheetTitle>{followUpTitle} - {firstName}</SheetTitle>
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
              {loading === 'send' ? '…' : 'Send Follow-up'}
            </Button>
            <p className="text-xs text-center text-muted-foreground flex-shrink-0">
              Sends now via connected email account
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
