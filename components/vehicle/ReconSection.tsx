'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ReconChecklistRow from './ReconChecklistRow'
import CostRollupCard from './CostRollupCard'

type ReconCategory = 'mandatory' | 'value_add' | 'standard'

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
  category: ReconCategory
}

interface ReconCostSummary {
  purchase_price: number | null
  recon_checklist_total: number
  ledger_expenses_total: number
  flooring_fee: number
  floor_plan_interest: number
  total_investment: number
  list_price: number | null
  estimated_profit: number | null
}

interface Props {
  vehicleId: string
  canEdit: boolean
  canDelete: boolean
  canManageTemplate?: boolean
}

export default function ReconSection({ vehicleId, canEdit, canDelete, canManageTemplate = false }: Props) {
  const [items, setItems] = useState<ReconChecklistItem[]>([])
  const [costSummary, setCostSummary] = useState<ReconCostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [addLabel, setAddLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [addScope, setAddScope] = useState<'vehicle' | 'all'>('vehicle')

  const load = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}/recon`)
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
      setCostSummary(data.cost_summary)
    }
    setLoading(false)
  }, [vehicleId])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/vehicles/${vehicleId}/recon`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        setItems(data.items)
        setCostSummary(data.cost_summary)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [vehicleId])

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
      load()
    }
  }

  async function handleSave(id: string, patch: { cost?: number | null; notes?: string; category?: ReconCategory }) {
    if ('category' in patch) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, category: patch.category! } : i))
    }
    await fetch(`/api/vehicles/${vehicleId}/recon/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!('category' in patch)) load()
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
      body: JSON.stringify({ label, apply_to_all: canManageTemplate && addScope === 'all' }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.item) {
        setItems(prev => prev.some(item => item.id === data.item.id) ? prev : [...prev, data.item])
      } else {
        await load()
      }
      setAddLabel('')
      setAddScope('vehicle')
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
  const mandatoryUnchecked = items.filter(i => i.category === 'mandatory' && !i.checked).length

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

      {costSummary && <CostRollupCard costSummary={costSummary} mandatoryUnchecked={mandatoryUnchecked} vehicleId={vehicleId} canEdit={canEdit} />}

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
        <div className="space-y-2">
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
          {canManageTemplate && (
            <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
              <div>
                <p className="text-xs font-medium">Add scope</p>
                <p className="text-[11px] text-muted-foreground">Choose whether this item is only for this unit or all active inventory vehicles.</p>
              </div>
              <select
                value={addScope}
                onChange={e => setAddScope(e.target.value === 'all' ? 'all' : 'vehicle')}
                className="rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="vehicle">Just this vehicle</option>
                <option value="all">All vehicles</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
