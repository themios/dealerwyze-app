'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearPendingCall } from './usePendingCall'
import { PendingCall, ActivityOutcome } from '@/types'
import { tomorrow9am, in2hours, prefixWithAuthorName } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, PhoneMissed, Voicemail } from 'lucide-react'
import DateTimePicker15 from '@/components/ui/DateTimePicker15'

interface AfterCallModalProps {
  open: boolean
  pendingCall: PendingCall | null
  onDismiss: () => void
}

type FollowUpOption = '2h' | 'tomorrow' | 'custom' | null

export default function AfterCallModal({ open, pendingCall, onDismiss }: AfterCallModalProps) {
  const [outcome, setOutcome] = useState<ActivityOutcome>(null)
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState<FollowUpOption>(null)
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    if (!outcome || !pendingCall) return
    setSaving(true)

    try {
      const { display_name } = (await fetch('/api/auth/me').then(r => r.ok ? r.json() : {}).catch(() => ({}))) as { display_name?: string }
      const callBody = prefixWithAuthorName(
        display_name,
        notes?.trim() ? notes.trim() : 'Outbound call'
      )
      const taskBody = prefixWithAuthorName(display_name, `Follow up with ${pendingCall.customerName}`)

      // 1. Update the pending call activity
      await supabase
        .from('activities')
        .update({
          outcome,
          body: callBody,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pendingCall.activityId)

      // 2. Create follow-up task if selected
      if (followUp) {
        let dueAt: Date | null = null
        if (followUp === '2h') dueAt = in2hours()
        else if (followUp === 'tomorrow') dueAt = tomorrow9am()
        else if (followUp === 'custom' && customDate) dueAt = new Date(customDate)

        if (dueAt) {
          await supabase.from('activities').insert({
            type: 'task',
            customer_id: pendingCall.customerId,
            body: taskBody,
            due_at: dueAt.toISOString(),
            priority: 'normal',
          })
        }
      }

      // 3. Clear pending call
      clearPendingCall()
      resetForm()
      onDismiss()
    } catch (err) {
      console.error('Error saving call', err)
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setOutcome(null)
    setNotes('')
    setFollowUp(null)
    setCustomDate('')
  }

  const outcomeButtons: { value: ActivityOutcome; label: string; icon: React.ReactNode }[] = [
    { value: 'answered', label: 'Answered', icon: <CheckCircle className="h-4 w-4" /> },
    { value: 'no_answer', label: 'No Answer', icon: <PhoneMissed className="h-4 w-4" /> },
    { value: 'left_vm', label: 'Left VM', icon: <Voicemail className="h-4 w-4" /> },
  ]

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
      clearPendingCall()
      onDismiss()
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="mb-4">
          <SheetTitle>How did the call go?</SheetTitle>
          <SheetDescription>
            {pendingCall?.customerName} · {pendingCall?.phone}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Outcome buttons */}
          <div>
            <p className="text-sm font-medium mb-2">Outcome <span className="text-destructive">*</span></p>
            <div className="grid grid-cols-3 gap-2">
              {outcomeButtons.map(({ value, label, icon }) => (
                <Button
                  key={value}
                  variant={outcome === value ? 'default' : 'outline'}
                  className="flex flex-col h-auto py-3 gap-1"
                  onClick={() => setOutcome(value)}
                >
                  {icon}
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-sm font-medium mb-2">Notes</p>
            <Textarea
              placeholder="What was discussed…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
              autoFocus={false}
            />
          </div>

          {/* Follow-up */}
          <div>
            <p className="text-sm font-medium mb-2">Schedule follow-up</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: '2h', label: 'In 2 hours' },
                { key: 'tomorrow', label: 'Tomorrow 9am' },
                { key: 'custom', label: 'Custom date' },
              ].map(({ key, label }) => (
                <Badge
                  key={key}
                  variant={followUp === key ? 'default' : 'outline'}
                  className="cursor-pointer px-3 py-1.5 text-sm"
                  onClick={() => setFollowUp(followUp === key ? null : key as FollowUpOption)}
                >
                  {label}
                </Badge>
              ))}
            </div>
            {followUp === 'custom' && (
              <div className="mt-2">
                <DateTimePicker15 value={customDate} onChange={setCustomDate} />
              </div>
            )}
          </div>

          {/* Save button */}
          <Button
            className="w-full h-12 text-base"
            disabled={!outcome || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save Call Log'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
