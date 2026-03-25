'use client'

import { useState, useRef } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ReconCategory = 'mandatory' | 'value_add' | 'standard'

interface ReconChecklistItem {
  id: string
  label: string
  is_required: boolean
  checked: boolean
  notes: string | null
  cost: number | null
  completed_at: string | null
  category: ReconCategory
}

interface Props {
  item: ReconChecklistItem
  onToggle: (id: string, checked: boolean) => Promise<void>
  onSave: (id: string, patch: { cost?: number | null; notes?: string; category?: ReconCategory }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  isReadOnly: boolean
  canDelete: boolean
}

const CATEGORY_LABELS: Record<ReconCategory, string> = {
  mandatory: 'Mandatory',
  value_add: 'Value-Add',
  standard: 'Routine',
}

const CATEGORY_STYLES: Record<ReconCategory, string> = {
  mandatory: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  value_add: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  standard:  'bg-muted text-muted-foreground',
}

const CATEGORY_CYCLE: ReconCategory[] = ['standard', 'mandatory', 'value_add']

export default function ReconChecklistRow({ item, onToggle, onSave, onDelete, isReadOnly, canDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [category, setCategory] = useState<ReconCategory>(item.category ?? 'standard')
  const costRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleToggle() {
    if (isReadOnly || toggling) return
    setToggling(true)
    await onToggle(item.id, !item.checked)
    setToggling(false)
  }

  function scheduleFieldSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const costVal = costRef.current?.value
      const notesVal = notesRef.current?.value
      const patch: { cost?: number | null; notes?: string } = {}
      if (costVal !== undefined) {
        const n = parseFloat(costVal)
        patch.cost = isNaN(n) ? null : n
      }
      if (notesVal !== undefined) patch.notes = notesVal
      onSave(item.id, patch)
    }, 600)
  }

  function cycleCategory(e: React.MouseEvent) {
    e.stopPropagation()
    if (isReadOnly) return
    const idx = CATEGORY_CYCLE.indexOf(category)
    const next = CATEGORY_CYCLE[(idx + 1) % CATEGORY_CYCLE.length]
    setCategory(next)
    onSave(item.id, { category: next })
  }

  return (
    <div className={`rounded-lg border bg-card transition-colors ${item.checked ? 'border-green-200 bg-green-50/30 dark:bg-green-950/10' : ''}`}>
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <button
          className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/40'}`}
          onClick={e => { e.stopPropagation(); handleToggle() }}
          disabled={isReadOnly || toggling}
          aria-label={item.checked ? 'Uncheck' : 'Check'}
        >
          {item.checked && <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <span className={`flex-1 text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}>{item.label}</span>
        {item.is_required && !item.checked && (
          <span className="text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">REQ</span>
        )}
        <button
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-opacity ${CATEGORY_STYLES[category]} ${isReadOnly ? 'opacity-60 cursor-default' : 'hover:opacity-80'}`}
          onClick={cycleCategory}
          title={isReadOnly ? CATEGORY_LABELS[category] : 'Click to change category'}
        >
          {CATEGORY_LABELS[category]}
        </button>
        {item.cost != null && item.cost > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">${item.cost.toFixed(2)}</span>
        )}
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t">
          <div className="pt-2">
            <label className="text-xs text-muted-foreground">Cost ($)</label>
            <input
              ref={costRef}
              type="number"
              min="0"
              step="0.01"
              defaultValue={item.cost ?? ''}
              readOnly={isReadOnly}
              onChange={scheduleFieldSave}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              ref={notesRef}
              rows={2}
              defaultValue={item.notes ?? ''}
              readOnly={isReadOnly}
              onChange={scheduleFieldSave}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              placeholder="Optional notes..."
            />
          </div>
          {item.completed_at && (
            <p className="text-[10px] text-muted-foreground">
              Completed {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
          {canDelete && !item.is_required && !isReadOnly && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive h-7 px-2 text-xs"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
