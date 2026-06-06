'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { ListingEditState } from '@/lib/listings/extractionTypes'

interface Props {
  items: ListingEditState[]
  onItemChange: (id: string, updates: Partial<ListingEditState>) => void
  onSelectAll: (checked: boolean) => void
  selectedCount: number
  allCount: number
}

export default function ListingExtractorGrid({
  items,
  onItemChange,
  onSelectAll,
  selectedCount,
  allCount
}: Props) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {/* Header row with Select All */}
      <div className="flex items-center gap-2 border-b pb-2">
        <Checkbox
          checked={selectedCount === allCount && allCount > 0}
          onCheckedChange={(checked: boolean | 'indeterminate') => onSelectAll(checked === true)}
          aria-label="Select all"
        />
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {allCount} selected
        </span>
      </div>

      {/* Grid rows */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-2 border rounded p-2 bg-muted/30 hover:bg-muted/50"
          >
            {/* Checkbox */}
            <Checkbox
              checked={item.selected}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                onItemChange(item.id, { selected: checked === true })
              }
            />

            {/* Address (editable) */}
            <div className="flex-1 min-w-0">
              {editing === `${item.id}-address` ? (
                <Input
                  value={item.address}
                  onChange={e => onItemChange(item.id, { address: e.target.value })}
                  onBlur={() => setEditing(null)}
                  className="h-8 text-xs"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-address`)}
                  className="text-xs font-medium truncate text-left hover:underline"
                >
                  {item.address}
                </button>
              )}
            </div>

            {/* Price (editable) */}
            <div className="w-20">
              {editing === `${item.id}-price` ? (
                <Input
                  value={item.price ?? ''}
                  onChange={e => onItemChange(item.id, { price: Number(e.target.value) || undefined })}
                  onBlur={() => setEditing(null)}
                  className="h-8 text-xs"
                  type="number"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-price`)}
                  className="text-xs hover:underline"
                >
                  {item.price ? `$${item.price.toLocaleString()}` : '-'}
                </button>
              )}
            </div>

            {/* Beds (editable) */}
            <div className="w-16">
              {editing === `${item.id}-beds` ? (
                <Input
                  value={item.beds ?? ''}
                  onChange={e => onItemChange(item.id, { beds: Number(e.target.value) || undefined })}
                  onBlur={() => setEditing(null)}
                  className="h-8 text-xs"
                  type="number"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-beds`)}
                  className="text-xs hover:underline"
                >
                  {item.beds ? `${item.beds}bd` : '-'}
                </button>
              )}
            </div>

            {/* Baths (editable) */}
            <div className="w-16">
              {editing === `${item.id}-baths` ? (
                <Input
                  value={item.baths ?? ''}
                  onChange={e => onItemChange(item.id, { baths: Number(e.target.value) || undefined })}
                  onBlur={() => setEditing(null)}
                  className="h-8 text-xs"
                  type="number"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-baths`)}
                  className="text-xs hover:underline"
                >
                  {item.baths ? `${item.baths}ba` : '-'}
                </button>
              )}
            </div>

            {/* Delete button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onItemChange(item.id, { selected: false })}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
