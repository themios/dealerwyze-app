'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { formatRelativeWithTime } from '@/lib/utils/relativeTime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Phone, MessageSquare, Mail, FileText, CheckSquare, Calendar, PhoneMissed, Voicemail, Pencil } from 'lucide-react'

const ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  note: <FileText className="h-3.5 w-3.5" />,
  task: <CheckSquare className="h-3.5 w-3.5" />,
  appointment: <Calendar className="h-3.5 w-3.5" />,
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

interface ActivityTimelineProps {
  activities: Activity[]
  currentUserId?: string
  isAdmin?: boolean
  onNoteUpdated?: () => void
}

export default function ActivityTimeline({ activities, currentUserId, isAdmin, onNoteUpdated }: ActivityTimelineProps) {
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
            const label = outcomeLabel(activity)
            const showEdit = canEditNote(activity)
            return (
              <div key={activity.id} className="relative">
                {/* Dot */}
                <div className="absolute -left-[26px] top-1 h-5 w-5 rounded-full bg-background border-2 border-border flex items-center justify-center text-muted-foreground">
                  {ICONS[activity.type]}
                </div>

                <div className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium capitalize">
                      {activity.type === 'sms' ? 'Text' : activity.type}
                      {activity.direction === 'inbound' ? ' (in)' : activity.direction === 'outbound' ? ' (out)' : ''}
                    </span>
                    {label && (
                      <Badge variant={outcomeVariant(activity.outcome!)} className="text-xs h-5">
                        {label}
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
                    <span className="text-xs text-muted-foreground ml-auto" suppressHydrationWarning title={new Date(activity.created_at).toLocaleString()}>
                      {formatRelativeWithTime(activity.created_at)}
                    </span>
                  </div>
                  {activity.body && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{activity.body}</p>
                  )}
                  {activity.due_at && !activity.completed_at && (
                    <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                      Due: {new Date(activity.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
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
