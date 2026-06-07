'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'

interface Props {
  items: VehicleEditState[]
  onItemChange: (id: string, updates: Partial<VehicleEditState>) => void
  onSelectAll: (checked: boolean) => void
  selectedCount: number
  allCount: number
}

export default function VehicleExtractorGrid({
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
          onCheckedChange={checked => onSelectAll(checked as boolean)}
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
            className="flex items-center gap-2 border rounded p-2 bg-muted/30 hover:bg-muted/50 text-sm"
          >
            {/* Checkbox */}
            <Checkbox
              checked={item.selected}
              onCheckedChange={checked =>
                onItemChange(item.id, { selected: checked as boolean })
              }
            />

            {/* Year Make Model (editable) */}
            <div className="flex-1 min-w-0">
              {editing === `${item.id}-fullname` ? (
                <div className="flex gap-1">
                  <Input
                    value={item.year}
                    onChange={e => onItemChange(item.id, { year: Number(e.target.value) })}
                    className="h-7 text-xs w-16"
                    type="number"
                    placeholder="Year"
                  />
                  <Input
                    value={item.make}
                    onChange={e => onItemChange(item.id, { make: e.target.value })}
                    className="h-7 text-xs flex-1"
                    placeholder="Make"
                    autoFocus
                  />
                  <Input
                    value={item.model}
                    onChange={e => onItemChange(item.id, { model: e.target.value })}
                    className="h-7 text-xs flex-1"
                    placeholder="Model"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                    className="h-7 px-2"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-fullname`)}
                  className="text-xs font-medium truncate text-left hover:underline"
                >
                  {item.year} {item.make} {item.model}
                </button>
              )}
            </div>

            {/* Price (editable) */}
            <div className="w-20">
              {editing === `${item.id}-price` ? (
                <Input
                  value={item.price || ''}
                  onChange={e => onItemChange(item.id, { price: Number(e.target.value) || undefined })}
                  onBlur={() => setEditing(null)}
                  className="h-7 text-xs"
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

            {/* Mileage (editable) */}
            <div className="w-24">
              {editing === `${item.id}-mileage` ? (
                <Input
                  value={item.mileage || ''}
                  onChange={e => onItemChange(item.id, { mileage: Number(e.target.value) || undefined })}
                  onBlur={() => setEditing(null)}
                  className="h-7 text-xs"
                  type="number"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-mileage`)}
                  className="text-xs hover:underline"
                >
                  {item.mileage ? `${(item.mileage / 1000).toFixed(0)}k` : '-'}
                </button>
              )}
            </div>

            {/* Color (editable) */}
            <div className="w-20">
              {editing === `${item.id}-color` ? (
                <Input
                  value={item.color || ''}
                  onChange={e => onItemChange(item.id, { color: e.target.value })}
                  onBlur={() => setEditing(null)}
                  className="h-7 text-xs"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditing(`${item.id}-color`)}
                  className="text-xs hover:underline"
                >
                  {item.color || '-'}
                </button>
              )}
            </div>

            {/* Delete button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onItemChange(item.id, { selected: false })}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
