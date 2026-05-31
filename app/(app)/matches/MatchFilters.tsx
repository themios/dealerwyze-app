'use client'

import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface BuyerProfile {
  id: string
  buyer_name: string
}

interface MatchFiltersProps {
  statusFilter: string[]
  onStatusFilterChange: (statuses: string[]) => void
  buyerIdFilter: string | null
  onBuyerIdFilterChange: (buyerId: string | null) => void
  buyers: BuyerProfile[]
}

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'sent', label: 'Sent to Buyer' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'closed', label: 'Closed' },
]

export function MatchFilters({
  statusFilter,
  onStatusFilterChange,
  buyerIdFilter,
  onBuyerIdFilterChange,
  buyers,
}: MatchFiltersProps) {
  const hasFilters = statusFilter.length > 0 || buyerIdFilter

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Status
          </label>
          <Select
            value={statusFilter[0] || ''}
            onValueChange={value => {
              if (value) {
                onStatusFilterChange([value])
              } else {
                onStatusFilterChange([])
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buyer filter */}
        {buyers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Buyer
            </label>
            <Select
              value={buyerIdFilter || ''}
              onValueChange={value => {
                if (value) {
                  onBuyerIdFilterChange(value)
                } else {
                  onBuyerIdFilterChange(null)
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All buyers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All buyers</SelectItem>
                {buyers.map(buyer => (
                  <SelectItem key={buyer.id} value={buyer.id}>
                    {buyer.buyer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={() => {
            onStatusFilterChange([])
            onBuyerIdFilterChange(null)
          }}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <X className="w-4 h-4" />
          Clear filters
        </button>
      )}
    </div>
  )
}
