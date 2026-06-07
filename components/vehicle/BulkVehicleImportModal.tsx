'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { VehicleEditState, BulkVehicleExtractorState, ExtractedVehicle } from '@/lib/vehicles/extractionTypes'
import VehicleExtractorGrid from './VehicleExtractorGrid'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: (count: number) => void
}

export default function BulkVehicleImportModal({
  open,
  onOpenChange,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<BulkVehicleExtractorState>({
    content: '',
    loading: false,
    items: [],
    selectedCount: 0,
  })

  async function handleExtract() {
    if (!state.content.trim()) {
      toast.error('Please paste some content first')
      return
    }

    setState(s => ({ ...s, loading: true, globalError: undefined }))

    try {
      const res = await fetch('/api/vehicles/intake/bulk-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: state.content })
      })

      const data = await res.json() as {
        vehicles?: ExtractedVehicle[]
        listings?: ExtractedVehicle[] // handle both vehicle and listing responses
        errors: string[]
      }

      if (!res.ok) {
        setState(s => ({
          ...s,
          loading: false,
          globalError: data.errors?.[0] || 'Extraction failed'
        }))
        return
      }

      // API returns either 'vehicles' or 'listings' depending on vertical
      const extracted = data.vehicles || data.listings || []
      const items: VehicleEditState[] = extracted.map((v, i) => ({
        ...v,
        id: `extracted-${i}`,
        selected: true
      }))

      setState(s => ({
        ...s,
        loading: false,
        items,
        selectedCount: items.length
      }))

      if (data.errors.length > 0) {
        toast.warning(`Extracted ${items.length} vehicles, ${data.errors.length} failed`)
      } else {
        toast.success(`Extracted ${items.length} vehicles`)
      }
    } catch {
      setState(s => ({
        ...s,
        loading: false,
        globalError: 'Network error during extraction'
      }))
    }
  }

  function handleSelectAll(checked: boolean) {
    setState(s => {
      const newItems = s.items.map(item => ({ ...item, selected: checked }))
      return {
        ...s,
        items: newItems,
        selectedCount: checked ? newItems.length : 0
      }
    })
  }

  function handleReset() {
    setState({
      content: '',
      loading: false,
      items: [],
      selectedCount: 0,
    })
  }

  async function handleImportSelected() {
    const selected = state.items.filter((i) => i.selected)
    if (selected.length === 0) return

    setState((s) => ({ ...s, loading: true }))

    try {
      const res = await fetch('/api/vehicles/intake/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected }),
      })

      const data = (await res.json()) as {
        success: number
        failed: number
        errors: Array<{ id: string; error: string }>
      }

      if (data.success === 0 && data.failed > 0) {
        // All failed
        toast.error(
          `Failed to import any vehicles. ${data.errors[0]?.error || 'Unknown error'}`,
        )
        setState((s) => ({
          ...s,
          loading: false,
          globalError: `${data.failed} vehicles failed to import`,
        }))
        return
      }

      // Success (full or partial)
      toast.success(
        `Imported ${data.success} vehicles${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
      )

      if (data.failed === 0) {
        // Complete success - close modal and refresh
        onOpenChange(false)
        router.refresh()
      } else {
        // Partial success - show errors, let user retry
        setState((s) => ({
          ...s,
          loading: false,
          items: s.items.map((item) => {
            const err = data.errors.find((e) => e.id === item.id)
            return err ? { ...item, extractionError: err.error } : item
          }),
        }))
      }
    } catch {
      toast.error('Network error during import')
      setState((s) => ({ ...s, loading: false }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Vehicles</DialogTitle>
        </DialogHeader>

        {/* Input phase */}
        {state.items.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste vehicle inventory from AutoTrader, Craigslist, or your dealer website
            </p>
            <Textarea
              placeholder="Paste inventory HTML or text... (VIN, year, make, model, price, mileage)"
              value={state.content}
              onChange={e => setState(s => ({ ...s, content: e.target.value }))}
              className="min-h-40"
            />
            {state.globalError && (
              <p className="text-sm text-destructive">{state.globalError}</p>
            )}
            <Button
              onClick={handleExtract}
              disabled={state.loading || !state.content.trim()}
              className="w-full"
            >
              {state.loading ? 'Extracting...' : 'Extract Vehicles'}
            </Button>
          </div>
        )}

        {/* Grid phase */}
        {state.items.length > 0 && (
          <div className="space-y-3">
            <VehicleExtractorGrid
              items={state.items}
              onItemChange={(id, updates) => {
                setState(s => {
                  const newItems = s.items.map(item =>
                    item.id === id ? { ...item, ...updates } : item
                  )
                  return {
                    ...s,
                    items: newItems,
                    selectedCount: newItems.filter(i => i.selected).length
                  }
                })
              }}
              onSelectAll={handleSelectAll}
              selectedCount={state.selectedCount}
              allCount={state.items.length}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Start Over
              </Button>
              <Button
                onClick={handleImportSelected}
                disabled={state.selectedCount === 0 || state.loading}
                className="flex-1"
              >
                {state.loading ? 'Importing...' : `Import ${state.selectedCount} Vehicles`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
