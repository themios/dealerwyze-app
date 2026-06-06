'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { ListingEditState, BulkExtractorState } from '@/lib/listings/extractionTypes'
import ListingExtractorGrid from './ListingExtractorGrid'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: (count: number) => void
}

export default function BulkListingImportModal({
  open,
  onOpenChange,
  onImportComplete
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<BulkExtractorState>({
    content: '',
    loading: false,
    items: [],
    selectedCount: 0
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
        listings: unknown[]
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

      const items: ListingEditState[] = data.listings.map((l, i) => {
        const listing = l as Record<string, unknown>
        return {
          address: String(listing.address || ''),
          price: typeof listing.price === 'number' ? listing.price : undefined,
          beds: typeof listing.beds === 'number' ? listing.beds : undefined,
          baths: typeof listing.baths === 'number' ? listing.baths : undefined,
          sqft: typeof listing.sqft === 'number' ? listing.sqft : undefined,
          property_type: typeof listing.property_type === 'string' ? listing.property_type : undefined,
          year_built: typeof listing.year_built === 'number' ? listing.year_built : undefined,
          lot_size: typeof listing.lot_size === 'string' ? listing.lot_size : undefined,
          mls_number: typeof listing.mls_number === 'string' ? listing.mls_number : undefined,
          description: typeof listing.description === 'string' ? listing.description : undefined,
          id: `extracted-${i}`,
          selected: true
        }
      })

      setState(s => ({
        ...s,
        loading: false,
        items,
        selectedCount: items.length
      }))

      if (data.errors.length > 0) {
        toast.warning(`Extracted ${items.length} listings, ${data.errors.length} failed`)
      } else {
        toast.success(`Extracted ${items.length} listings`)
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

  async function handleImportSelected() {
    const selected = state.items.filter(i => i.selected)
    if (selected.length === 0) return

    setState(s => ({ ...s, loading: true }))

    try {
      const res = await fetch('/api/vehicles/intake/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected })
      })

      const data = await res.json() as {
        success: number
        failed: number
        errors: Array<{ id: string; error: string }>
      }

      if (data.success === 0 && data.failed > 0) {
        // All failed
        toast.error(`Failed to import any listings. ${data.errors[0]?.error}`)
        setState(s => ({
          ...s,
          loading: false,
          globalError: `${data.failed} listings failed to import`
        }))
        return
      }

      // Success (full or partial)
      toast.success(`Imported ${data.success} listings${data.failed > 0 ? `, ${data.failed} failed` : ''}`)

      if (data.failed === 0) {
        // Complete success - close modal and refresh
        setTimeout(() => {
          onOpenChange(false)
          onImportComplete?.(data.success)
          router.refresh()
        }, 500)
      } else {
        // Partial success - show errors, let user retry/fix
        setState(s => ({
          ...s,
          loading: false,
          items: s.items.map(item => {
            const err = data.errors.find(e => e.id === item.id)
            return err ? { ...item, extractionError: err.error } : item
          })
        }))
      }
    } catch {
      toast.error('Network error during import')
      setState(s => ({ ...s, loading: false }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Listings</DialogTitle>
        </DialogHeader>

        {/* Input phase */}
        {state.items.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste website HTML or listing text containing multiple properties
            </p>
            <Textarea
              placeholder="Paste HTML or text..."
              value={state.content}
              onChange={e => setState(s => ({ ...s, content: e.target.value }))}
              className="min-h-32"
            />
            {state.globalError && (
              <p className="text-sm text-destructive">{state.globalError}</p>
            )}
            <Button
              onClick={handleExtract}
              disabled={state.loading || !state.content.trim()}
              className="w-full"
            >
              {state.loading ? 'Extracting...' : 'Extract Listings'}
            </Button>
          </div>
        )}

        {/* Grid phase */}
        {state.items.length > 0 && (
          <div className="space-y-3">
            <ListingExtractorGrid
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
            <Button
              onClick={handleImportSelected}
              disabled={state.selectedCount === 0 || state.loading}
              className="w-full"
            >
              {state.loading ? 'Importing...' : `Import ${state.selectedCount} Listings`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
