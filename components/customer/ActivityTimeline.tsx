import { Activity } from '@/types'
import { formatRelativeTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Phone, MessageSquare, Mail, FileText, CheckSquare, Calendar, PhoneMissed, Voicemail } from 'lucide-react'

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
}

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No activity yet
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4 pl-10">
        {activities.map((activity) => {
          const label = outcomeLabel(activity)
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
                  <span className="text-xs text-muted-foreground ml-auto" suppressHydrationWarning>
                    {formatRelativeTime(activity.created_at)}
                  </span>
                </div>
                {activity.body && (
                  <p className="text-sm text-muted-foreground mt-1">{activity.body}</p>
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
  )
}
