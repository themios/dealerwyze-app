'use client'

import { Activity } from '@/types'
import { MessageSquare, Mail, Clock, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ScheduledOutreachCardProps {
  activities: Activity[]
}

/** Parse the pending-step JSON stored in activity.body at enrollment time */
function parsePendingBody(raw: string): {
  subject: string
  stepLabel: string
  sequenceName: string
  sequenceDay: number
  stepTotal: number
  preview: string
} | null {
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    return {
      subject:      obj.subject      ?? '',
      stepLabel:    obj.step_label   ?? '',
      sequenceName: obj.sequence_name ?? '',
      sequenceDay:  obj.sequence_day  ?? 0,
      stepTotal:    obj.step_total    ?? 0,
      preview:      obj.body         ?? '',
    }
  } catch {
    return null
  }
}

function formatDue(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / 86400000)

  if (diffDays < 0)  return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 6)  return `In ${diffDays} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ScheduledOutreachCard({ activities }: ScheduledOutreachCardProps) {
  if (activities.length === 0) return null

  // Sort by due_at ascending
  const sorted = [...activities].sort((a, b) => {
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })

  return (
    <div className="px-4 py-3 border-b">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-l-2 border-blue-400 pl-2 flex items-center gap-1.5">
        <Bot className="h-3.5 w-3.5 text-blue-500" />
        Scheduled Outreach
        <span className="ml-1 text-xs font-normal bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">{activities.length}</span>
      </h3>

      <div className="space-y-2">
        {sorted.map((activity) => {
          const parsed = activity.body ? parsePendingBody(activity.body) : null
          const isEmail = activity.type === 'email_followup' || activity.type === 'email'
          const channel = isEmail ? 'Email' : 'Text'
          const Icon = isEmail ? Mail : MessageSquare

          // Title to display: subject for email, step label, or fallback
          const title = isEmail
            ? (parsed?.subject || parsed?.stepLabel || `Email - Step ${parsed?.sequenceDay ?? ''}`)
            : (parsed?.stepLabel || `Text - Step ${parsed?.sequenceDay ?? ''}`)

          const sequenceName = parsed?.sequenceName ?? ''
          const stepInfo = parsed?.sequenceDay && parsed?.stepTotal
            ? `Step ${parsed.sequenceDay} of ${parsed.stepTotal}`
            : null
          const preview = parsed?.preview
            ? parsed.preview.replace(/<[^>]+>/g, '').slice(0, 80)
            : null

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Icon className="h-3.5 w-3.5" />
              </div>

              <div className="min-w-0 flex-1">
                {/* Title row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{title}</span>
                  <Badge variant="outline" className="text-xs h-5 border-blue-300 text-blue-700 shrink-0">
                    {channel}
                  </Badge>
                  {stepInfo && (
                    <Badge variant="outline" className="text-xs h-5 shrink-0">
                      {stepInfo}
                    </Badge>
                  )}
                </div>

                {/* Sequence name */}
                {sequenceName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{sequenceName}</p>
                )}

                {/* Preview text */}
                {preview && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>
                )}
              </div>

              {/* Due date */}
              {activity.due_at && (
                <div className="shrink-0 flex items-center gap-1 text-xs text-blue-600 font-medium mt-0.5">
                  <Clock className="h-3 w-3" />
                  {formatDue(activity.due_at)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
