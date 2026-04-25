'use client'

import { useState } from 'react'
import { Activity } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { in2hours, tomorrow9am } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckSquare, Phone, MessageSquare, Calendar, FileText } from 'lucide-react'
import { useOpenCustomer } from '@/components/today/useOpenCustomer'

const ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
  appointment: <Calendar className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
  email: <MessageSquare className="h-4 w-4" />,
}

interface TaskItemProps {
  activity: Activity
  onUpdate: () => void
}

export default function TaskItem({ activity, onUpdate }: TaskItemProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()
  const openCustomer = useOpenCustomer()

  const isOverdue = activity.due_at && new Date(activity.due_at) < new Date()

  async function markDone() {
    setLoading('done')
    await supabase
      .from('activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activity.id)
    onUpdate()
    setLoading(null)
  }

  async function snooze(type: '2h' | 'tomorrow') {
    setLoading(type)
    const until = type === '2h' ? in2hours() : tomorrow9am()
    await supabase
      .from('activities')
      .update({ snoozed_until: until.toISOString() })
      .eq('id', activity.id)
    onUpdate()
    setLoading(null)
  }

  const handleCardClick = () => {
    if (activity.customer?.id) openCustomer(activity.id, activity.customer.id)
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div
        className="flex items-start gap-3 cursor-pointer hover:opacity-90"
        onClick={handleCardClick}
        onKeyDown={e => e.key === 'Enter' && handleCardClick()}
        role="button"
        tabIndex={0}
        aria-label={`Open ${activity.customer?.name ?? 'customer'}`}
      >
        <div className={`mt-0.5 flex-shrink-0 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          {ICONS[activity.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm leading-snug">
                {activity.body || `Follow up — ${activity.type}`}
              </p>
              {activity.customer && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activity.customer.name}
                </p>
              )}
            </div>
            {activity.priority === 'high' && (
              <Badge variant="destructive" className="text-xs flex-shrink-0">High</Badge>
            )}
          </div>
          {activity.due_at && (
            <p
              className={`text-xs mt-1 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
              suppressHydrationWarning
            >
              {isOverdue ? 'Overdue · ' : 'Due · '}
              {new Date(activity.due_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <Button
          size="sm"
          variant="default"
          className="flex-1 h-10"
          onClick={markDone}
          disabled={loading !== null}
        >
          {loading === 'done' ? '…' : 'Done'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 text-xs"
          onClick={() => snooze('2h')}
          disabled={loading !== null}
        >
          {loading === '2h' ? '…' : 'Snooze 2h'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 text-xs"
          onClick={() => snooze('tomorrow')}
          disabled={loading !== null}
        >
          {loading === 'tomorrow' ? '…' : 'Tomorrow'}
        </Button>
      </div>
    </div>
  )
}
