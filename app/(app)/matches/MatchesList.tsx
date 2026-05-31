'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface MatchPhoto {
  url: string
  caption?: string
}

interface Match {
  id: string
  status: 'new' | 'sent' | 'reviewed' | 'ignored' | 'closed'
  matched_at: string
  agent_notified_at: string | null
  buyer_profile_id: string
  listing_id: string
  buyer_profiles: {
    id: string
    buyer_name: string
    location: string | null
    price_min: number | null
    price_max: number | null
    bedrooms_min: number | null
    bedrooms_max: number | null
    bathrooms_min: number | null
    bathrooms_max: number | null
    sqft_min: number | null
    sqft_max: number | null
    year_built_min: number | null
    year_built_max: number | null
    property_type: string
    hoa_allowed: boolean
  }
  vehicles: {
    id: string
    address: string
    city: string | null
    bedrooms: number | null
    bathrooms: number | null
    price: number | null
    sqft: number | null
    year_built: number | null
    property_type: string | null
    mls_number: string | null
    photos: MatchPhoto[] | null
  }
}

const statusBadgeColor: Record<string, string> = {
  new: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  reviewed: 'bg-slate-100 text-slate-800',
  ignored: 'bg-red-100 text-red-800',
  closed: 'bg-green-100 text-green-800',
}

const statusLabel: Record<string, string> = {
  new: 'New',
  sent: 'Sent to Buyer',
  reviewed: 'Reviewed',
  ignored: 'Ignored',
  closed: 'Closed',
}

function formatPrice(price: number | null): string {
  if (!price) return 'Price TBD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price)
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface MatchesListProps {
  matches: Match[]
  selectedIds: Set<string>
  onSelectAll: () => void
  onSelect: (id: string) => void
  onRefetch: () => Promise<void>
  isUpdating: boolean
}

export function MatchesList({
  matches,
  selectedIds,
  onSelectAll,
  onSelect,
  onRefetch,
  isUpdating,
}: MatchesListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function handleStatusChange(matchId: string, newStatus: string) {
    setUpdatingId(matchId)
    try {
      const res = await fetch(`/api/matched-opportunities/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        throw new Error('Failed to update status')
      }

      // Refetch to get updated data
      await onRefetch()
    } catch (err) {
      console.error('Error updating match status:', err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 border-b px-4 py-3 flex items-center gap-4">
        <input
          type="checkbox"
          checked={selectedIds.size === matches.length && matches.length > 0}
          onChange={onSelectAll}
          disabled={isUpdating}
          className="w-4 h-4 rounded border-slate-300 cursor-pointer disabled:opacity-50"
        />
        <div className="flex-1 grid grid-cols-4 gap-4 text-sm font-semibold text-slate-600">
          <div>Buyer / Listing</div>
          <div>Price & Size</div>
          <div>Matched</div>
          <div>Status</div>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {matches.map(match => (
          <div key={match.id}>
            {/* Main row */}
            <div className="px-4 py-3 flex items-center gap-4 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedIds.has(match.id)}
                onChange={() => onSelect(match.id)}
                disabled={isUpdating}
                className="w-4 h-4 rounded border-slate-300 cursor-pointer disabled:opacity-50"
              />
              <button
                onClick={() =>
                  setExpandedId(expandedId === match.id ? null : match.id)
                }
                className="flex-1 grid grid-cols-4 gap-4 text-sm text-left items-center hover:text-blue-600"
              >
                {/* Buyer / Listing */}
                <div>
                  <p className="font-medium text-slate-900">
                    {match.buyer_profiles.buyer_name}
                  </p>
                  <p className="text-slate-600 truncate">
                    {match.vehicles.address}
                  </p>
                </div>

                {/* Price & Size */}
                <div className="text-slate-600">
                  <p className="font-medium text-slate-900">
                    {formatPrice(match.vehicles.price)}
                  </p>
                  <p className="text-xs">
                    {match.vehicles.bedrooms}bd/{match.vehicles.bathrooms}ba
                    {match.vehicles.sqft && ` • ${match.vehicles.sqft.toLocaleString()}sqft`}
                  </p>
                </div>

                {/* Matched date */}
                <div className="text-slate-600 text-sm">
                  {formatDate(match.matched_at)}
                </div>

                {/* Status */}
                <div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      statusBadgeColor[match.status]
                    }`}
                  >
                    {statusLabel[match.status]}
                  </span>
                </div>
              </button>

              {/* Expand icon */}
              <button
                onClick={() =>
                  setExpandedId(expandedId === match.id ? null : match.id)
                }
                className="text-slate-400 hover:text-slate-600"
              >
                {expandedId === match.id ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Expanded details */}
            {expandedId === match.id && (
              <div className="px-4 py-4 bg-slate-50 border-t">
                <div className="grid grid-cols-2 gap-8">
                  {/* Buyer criteria */}
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">
                      Buyer Profile: {match.buyer_profiles.buyer_name}
                    </h4>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div>
                        <span className="font-medium text-slate-700">
                          Price:
                        </span>
                        {' '}
                        {formatPrice(match.buyer_profiles.price_min)}
                        {' '}
                        -
                        {' '}
                        {formatPrice(match.buyer_profiles.price_max)}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">
                          Bedrooms:
                        </span>{' '}
                        {match.buyer_profiles.bedrooms_min || '?'} -{' '}
                        {match.buyer_profiles.bedrooms_max || '?'}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">
                          Bathrooms:
                        </span>{' '}
                        {match.buyer_profiles.bathrooms_min || '?'} -{' '}
                        {match.buyer_profiles.bathrooms_max || '?'}
                      </div>
                      {match.buyer_profiles.sqft_min && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Square Feet:
                          </span>{' '}
                          {match.buyer_profiles.sqft_min?.toLocaleString()} -{' '}
                          {match.buyer_profiles.sqft_max?.toLocaleString()}
                        </div>
                      )}
                      {match.buyer_profiles.location && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Location:
                          </span>{' '}
                          {match.buyer_profiles.location}
                        </div>
                      )}
                      {match.buyer_profiles.year_built_min && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Year Built:
                          </span>{' '}
                          {match.buyer_profiles.year_built_min} -{' '}
                          {match.buyer_profiles.year_built_max}
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-slate-700">
                          Property Type:
                        </span>{' '}
                        {match.buyer_profiles.property_type}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">
                          HOA Allowed:
                        </span>{' '}
                        {match.buyer_profiles.hoa_allowed ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>

                  {/* Listing details */}
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">
                      Listing Details
                    </h4>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div>
                        <span className="font-medium text-slate-700">
                          Address:
                        </span>{' '}
                        {match.vehicles.address}
                        {match.vehicles.city && `, ${match.vehicles.city}`}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">
                          Price:
                        </span>{' '}
                        {formatPrice(match.vehicles.price)}
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">
                          Bedrooms/Bathrooms:
                        </span>{' '}
                        {match.vehicles.bedrooms || '?'}/
                        {match.vehicles.bathrooms || '?'}
                      </div>
                      {match.vehicles.sqft && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Square Feet:
                          </span>{' '}
                          {match.vehicles.sqft.toLocaleString()}
                        </div>
                      )}
                      {match.vehicles.year_built && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Year Built:
                          </span>{' '}
                          {match.vehicles.year_built}
                        </div>
                      )}
                      {match.vehicles.property_type && (
                        <div>
                          <span className="font-medium text-slate-700">
                            Property Type:
                          </span>{' '}
                          {match.vehicles.property_type}
                        </div>
                      )}
                      {match.vehicles.mls_number && (
                        <div>
                          <span className="font-medium text-slate-700">
                            MLS #:
                          </span>{' '}
                          {match.vehicles.mls_number}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t flex gap-2">
                  <Select
                    value={match.status}
                    onValueChange={newStatus =>
                      handleStatusChange(match.id, newStatus)
                    }
                    disabled={updatingId === match.id}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="sent">Sent to Buyer</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
