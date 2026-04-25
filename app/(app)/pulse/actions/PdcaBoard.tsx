'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

type ActionStatus = 'plan' | 'doing' | 'checking' | 'standardized'

interface PulseAction {
  id: string
  category: Category
  plan_text: string
  status: ActionStatus
  score_before: number | null
  score_after: number | null
  due_at: string | null
  assignee: { id: string; display_name: string } | null
}

const COLUMNS: { status: ActionStatus; label: string; description: string }[] = [
  { status: 'plan',         label: 'Plan', description: 'What needs to change?' },
  { status: 'doing',        label: 'Do',   description: 'Actively being worked on' },
  { status: 'checking',     label: 'Check', description: 'Monitoring for impact' },
  { status: 'standardized', label: 'Act',  description: 'Confirmed working - now standard' },
]

export default function PdcaBoard() {
  const [actions, setActions] = useState<PulseAction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pulse/actions')
      .then(r => r.json())
      .then(d => { setActions(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function moveCard(id: string, status: ActionStatus) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    await fetch(`/api/pulse/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  const statusBorderColor: Record<ActionStatus, string> = {
    plan:         'border-l-blue-400',
    doing:        'border-l-orange-400',
    checking:     'border-l-yellow-400',
    standardized: 'border-l-green-500',
  }

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colActions = actions.filter(a => a.status === col.status)
          return (
            <div key={col.status} className="bg-muted/40 rounded-xl p-3 min-h-[200px]">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{col.label}</p>
                <p className="text-[10px] text-muted-foreground">{col.description}</p>
              </div>
              <div className="space-y-2">
                {colActions.map(action => (
                  <div key={action.id} className={cn('bg-card rounded-lg p-3 border-l-2 border border-border shadow-sm', statusBorderColor[action.status])}>
                    <p className="text-[10px] font-semibold text-orange-600 uppercase mb-1">
                      {CATEGORY_LABELS[action.category] ?? action.category}
                    </p>
                    <p className="text-xs font-medium text-foreground mb-2 leading-snug">{action.plan_text}</p>
                    {action.assignee && (
                      <p className="text-[10px] text-muted-foreground">Assigned: {action.assignee.display_name}</p>
                    )}
                    {action.due_at && (
                      <p className="text-[10px] text-muted-foreground">Due {new Date(action.due_at).toLocaleDateString()}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                      {COLUMNS.filter(c => c.status !== col.status).map(c => (
                        <Button
                          key={c.status}
                          variant="ghost"
                          size="sm"
                          onClick={() => moveCard(action.id, c.status)}
                          className="h-6 text-[11px] px-2"
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                {colActions.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-6 italic">No items</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
