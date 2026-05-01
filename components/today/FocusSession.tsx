'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { QueueItem } from '@/lib/today/queueSort'

interface Props {
  open: boolean
  items: QueueItem[]
  completedKeys: string[]
  onClose: () => void
  renderItem: (item: QueueItem) => React.ReactNode
}

export default function FocusSession({ open, items, completedKeys, onClose, renderItem }: Props) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const doneCount = items.filter(item => completedKeys.includes(item.key)).length

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus Session</p>
            <h2 className="text-xl font-semibold">Best {items.length} leads for the next 30 minutes</h2>
            <p className="text-sm text-muted-foreground">{doneCount} of {items.length} handled</p>
          </div>
          <button type="button" aria-label="Close focus session" onClick={onClose} className="rounded-full border p-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-4 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${items.length === 0 ? 0 : (doneCount / items.length) * 100}%` }} />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto">
          {items.length === 0 ? (
            <div className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">No leads available for a focus session.</div>
          ) : (
            items.map(item => (
              <div key={item.key} className={completedKeys.includes(item.key) ? 'opacity-50' : ''}>
                {renderItem(item)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
