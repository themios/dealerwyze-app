'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ReconChecklistRow from './ReconChecklistRow'
import CostRollupCard from './CostRollupCard'

interface ReconChecklistItem {
  id: string
  vehicle_id: string
  org_id: string
  label: string
  is_required: boolean
  sort_order: number
  checked: boolean
  notes: string | null
  cost: number | null
  completed_at: string | null
}

interface ReconCostSummary {
  purchase_price: number | null
  recon_checklist_total: number
  ledger_expenses_total: number
  total_investment: number
  list_price: number | null
  estimated_profit: number | null
}

interface Props {
  vehicleId: string
  canEdit: boolean
  canDelete: boolean
}

export default function ReconSection({ vehicleId, canEdit, canDelete }: Props) {
  const [items, setItems] = useState<ReconChecklistItem[]>([])
  const [costSummary, setCostSummary] = useState<ReconCostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [addLabel, setAddLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}/recon`)
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
      setCostSummary(data.cost_summary)
    }
    setLoading(false)
  }, [vehicleId])

  useEffect(() => { load() }, [load])

  async function handleToggle(id: string, checked: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked, completed_at: checked ? new Date().toISOString() : null } : i))
    const res = await fetch(`/api/vehicles/${vehicleId}/recon/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked }),
    })
    if (!res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))
    } else {
      load() // refresh cost summary
    }
  }

  async function handleSave(id: string, patch: { cost?: number | null; notes?: string }) {
    await fetch(`/api/vehicles/${vehicleId}/recon/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    load() // refresh cost summary
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this checklist item?')) return
    setItems(prev => prev.filter(i => i.id !== id))
    const res = await fetch(`/api/vehicles/${vehicleId}/recon/${id}`, { method: 'DELETE' })
    if (!res.ok) load()
  }

  async function handleAdd() {
    const label = addLabel.trim()
    if (!label) return
    setAdding(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/recon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    if (res.ok) {
      const data = await res.json()
      setItems(prev => [...prev, data.item])
      setAddLabel('')
    }
    setAdding(false)
  }

  if (loading) return (
    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
      Loading checklist...
    </div>
  )

  const done = items.filter(i => i.checked).length
  const total = items.length

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Reconditioning Checklist</h3>
          <p className="text-xs text-muted-foreground">{done} of {total} complete</p>
        </div>
        {total > 0 && (
          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300 rounded-full"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {costSummary && <CostRollupCard costSummary={costSummary} />}

      <div className="space-y-2">
        {items.map(item => (
          <ReconChecklistRow
            key={item.id}
            item={item}
            onToggle={handleToggle}
            onSave={handleSave}
            onDelete={handleDelete}
            isReadOnly={!canEdit}
            canDelete={canDelete}
          />
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add checklist item..."
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            maxLength={120}
          />
          <Button size="sm" onClick={handleAdd} disabled={adding || !addLabel.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
