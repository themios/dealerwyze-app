'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardList, Loader2 } from 'lucide-react'

interface ChecklistItem {
  id: string
  title: string
  status: 'open' | 'done'
  priority: string
  due_at: string | null
  completed_at: string | null
}

interface Props {
  customerId: string
  customerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DealChecklistSheet({ customerId, customerName, open, onOpenChange }: Props) {
  const [items, setItems]     = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/deal-checklist`)
      const json = await res.json()
      setItems(json.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { if (open) load() }, [open, load])

  async function seed() {
    setSeeding(true)
    try {
      await fetch(`/api/customers/${customerId}/deal-checklist`, { method: 'POST' })
      await load()
    } finally {
      setSeeding(false)
    }
  }

  async function toggle(item: ChecklistItem) {
    const newStatus = item.status === 'done' ? 'open' : 'done'
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    await fetch(`/api/customers/${customerId}/deal-checklist`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: item.id, status: newStatus }),
    })
  }

  const done  = items.filter(i => i.status === 'done').length
  const total = items.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Deal Checklist
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{customerName}</p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-muted-foreground">No checklist yet for this deal.</p>
            <Button onClick={seed} disabled={seeding} className="w-full h-12">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start Deal Checklist
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{done} of {total} complete</span>
                <Badge variant={pct === 100 ? 'default' : 'secondary'}>{pct}%</Badge>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Items */}
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => toggle(item)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                {item.status === 'done'
                  ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                }
                <span className={`text-sm flex-1 ${item.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                  {item.title}
                </span>
                {item.priority === 'must' && item.status !== 'done' && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Required</Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
