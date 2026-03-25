'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { formatRelativeWithTime } from '@/lib/utils/relativeTime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Phone, MessageSquare, Mail, FileText, CheckSquare, Calendar, Check, Pencil, Bot, CornerUpLeft } from 'lucide-react'
import { ReplyContext } from '@/components/customer/EmailButton'

const ICONS: Record<string, React.ReactNode> = {
  call:          <Phone className="h-3.5 w-3.5" />,
  sms:           <MessageSquare className="h-3.5 w-3.5" />,
  sms_followup:  <Bot className="h-3.5 w-3.5" />,
  email:         <Mail className="h-3.5 w-3.5" />,
  email_followup:<Bot className="h-3.5 w-3.5" />,
  note:          <FileText className="h-3.5 w-3.5" />,
  task:          <CheckSquare className="h-3.5 w-3.5" />,
  appointment:   <Calendar className="h-3.5 w-3.5" />,
}

/** Parse the step_label and message body from an automated sequence activity body */
function parseAutoBody(raw: string): { stepLabel: string; subject: string; text: string } | null {
  // Sent sequence activities: body starts with "[Auto: Day N - Name]\n"
  const autoMatch = raw.match(/^\[Auto:\s*([^\]]+)\]\n([\s\S]*)$/)
  if (autoMatch) {
    const rest = autoMatch[2] ?? ''
    const subjectMatch = rest.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/)
    return {
      stepLabel: autoMatch[1].trim(),
      subject:   subjectMatch?.[1]?.trim() ?? '',
      text:      subjectMatch?.[2]?.trim() ?? rest.trim(),
    }
  }
  return null
}

function outcomeLabel(activity: Activity) {
  if (activity.type !== 'call') return null
  const map: Record<string, string> = {
    answered: 'Answered',
    no_answer: 'No Answer',
    left_vm: 'Left VM',
    pending: 'In progress',
  }
  return activity.outcome ? map[activity.outcome] : null
}

function outcomeVariant(outcome: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (outcome === 'answered') return 'default'
  if (outcome === 'no_answer') return 'destructive'
  return 'secondary'
}

function isSentEmail(activity: Activity): boolean {
  return activity.type === 'email' && activity.direction === 'outbound' && !!activity.completed_at
}

interface ActivityTimelineProps {
  activities: Activity[]
  currentUserId?: string
  isAdmin?: boolean
  onNoteUpdated?: () => void
  onEmailReply?: (ctx: ReplyContext) => void
}

export default function ActivityTimeline({ activities, currentUserId, isAdmin, onNoteUpdated, onEmailReply }: ActivityTimelineProps) {
  const [editingNote, setEditingNote] = useState<Activity | null>(null)
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  const canEditNote = (activity: Activity) =>
    activity.type === 'note' &&
    (activity.created_by === currentUserId || isAdmin)

  async function handleSaveNote() {
    if (!editingNote || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/activities/${editingNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update note')
      }
      onNoteUpdated?.()
      setEditingNote(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No activity yet
      </div>
    )
  }

  return (
    <>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-4 pl-10">
          {activities.map((activity) => {
            const label       = outcomeLabel(activity)
            const showEdit    = canEditNote(activity)
            const autoBody    = activity.body ? parseAutoBody(activity.body) : null
            const isAuto      = !!autoBody || activity.type === 'email_followup' || activity.type === 'sms_followup'
            const isSequenceType = activity.type === 'email_followup' || activity.type === 'sms_followup'
            const typeName    = activity.type === 'sms' || activity.type === 'sms_followup' ? 'Text'
                              : activity.type === 'email' || activity.type === 'email_followup' ? 'Email'
                              : activity.type

            const isInboundEmail = activity.type === 'email' && activity.direction === 'inbound'

            function handleReply() {
              if (!onEmailReply) return
              // Parse subject from body format "Subject: ...\n\n..."
              const subjectMatch = activity.body?.match(/^Subject:\s*(.+)\n/)
              const rawSubject = subjectMatch?.[1]?.trim() ?? '(no subject)'
              onEmailReply({
                subject:   rawSubject,
                threadId:  activity.gmail_thread_id ?? null,
                messageId: activity.gmail_message_id ?? null,
              })
            }

            return (
              <div key={activity.id} className="relative">
                {/* Dot */}
                <div className={`absolute -left-[26px] top-1 h-5 w-5 rounded-full bg-background border-2 flex items-center justify-center ${
                  isSentEmail(activity) ? 'border-green-500 text-green-600'
                  : isAuto ? 'border-blue-400 text-blue-600'
                  : 'border-border text-muted-foreground'
                }`}>
                  {isSentEmail(activity) ? <Check className="h-3.5 w-3.5" /> : (ICONS[activity.type] ?? ICONS['note'])}
                </div>

                <div className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium capitalize">
                      {typeName}
                      {activity.direction === 'inbound' ? ' (in)' : activity.direction === 'outbound' ? ' (out)' : ''}
                    </span>

                    {/* Sent auto sequence: step label */}
                    {autoBody && (
                      <Badge variant="outline" className="text-xs h-5 border-blue-400 text-blue-700 gap-1">
                        <Bot className="h-3 w-3" />
                        {autoBody.stepLabel}
                      </Badge>
                    )}

                    {label && (
                      <Badge variant={outcomeVariant(activity.outcome!)} className="text-xs h-5">
                        {label}
                      </Badge>
                    )}
                    {activity.completed_at && (activity.type === 'email' || activity.type === 'email_followup') && (
                      <Badge variant="outline" className="text-xs h-5 border-green-600 text-green-700">
                        Sent
                      </Badge>
                    )}
                    {showEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-muted-foreground"
                        onClick={() => {
                          setEditingNote(activity)
                          setEditBody(activity.body ?? '')
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {isInboundEmail && onEmailReply && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-muted-foreground"
                        onClick={handleReply}
                        title="Reply"
                      >
                        <CornerUpLeft className="h-3 w-3" />
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto" suppressHydrationWarning title={new Date(activity.created_at).toLocaleString()}>
                      {formatRelativeWithTime(activity.created_at)}
                    </span>
                  </div>

                  {/* Body display */}
                  {autoBody ? (
                    <div className="mt-1 space-y-0.5">
                      {autoBody.subject && (
                        <p className="text-sm font-medium">{autoBody.subject}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{autoBody.text}</p>
                    </div>
                  ) : activity.body && !isSequenceType ? (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{activity.body}</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Sheet open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl h-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Edit note</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={6}
              className="resize-none"
              placeholder="Note content…"
            />
            <Button className="w-full" onClick={handleSaveNote} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
