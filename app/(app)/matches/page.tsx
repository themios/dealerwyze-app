'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { MatchesList } from './MatchesList'
import { MatchFilters } from './MatchFilters'
import { useMatchesTranslations } from '@/lib/i18n/useWaveTranslations'

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

export default function MatchesPage() {
  const t = useMatchesTranslations()
  const [matches, setMatches] = useState<Match[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters and pagination
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [buyerIdFilter, setBuyerIdFilter] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null)

  // Fetch matches
  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (statusFilter.length > 0) {
        // Note: for simplicity, we'll filter on first status for server-side
        // In production, might want multiple status support
        params.append('status', statusFilter[0])
      }

      if (buyerIdFilter) {
        params.append('buyer_id', buyerIdFilter)
      }

      const res = await fetch(`/api/matched-opportunities?${params}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch matches: ${res.statusText}`)
      }

      const data = await res.json()
      setMatches(data.matches || [])
      setTotal(data.total || 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load matches'
      setError(message)
      console.error('Error fetching matches:', err)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, buyerIdFilter, offset, limit])

  useEffect(() => {
    const load = async () => {
      await fetchMatches()
    }
    load().catch(err => console.error('Failed to load matches:', err))
  }, [fetchMatches])

  async function handleBulkStatusUpdate(newStatus: string) {
    if (selectedIds.size === 0) return

    setIsUpdating(true)
    try {
      const res = await fetch('/api/matched-opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          status: newStatus,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to update matches: ${res.statusText}`)
      }

      setUpdateSuccess(`Updated ${selectedIds.size} match${selectedIds.size !== 1 ? 'es' : ''}`)
      setSelectedIds(new Set())

      // Refetch
      await fetchMatches()

      // Clear success message after 3 seconds
      setTimeout(() => setUpdateSuccess(null), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update matches'
      setError(message)
      console.error('Error updating matches:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(matches.map(m => m.id)))
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // Get unique buyer profiles for filter dropdown
  const uniqueBuyers = Array.from(
    new Map(matches.map(m => [m.buyer_profile_id, m.buyer_profiles])).values()
  )

  const hasMore = offset + limit < total

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
        <p className="text-slate-600 mt-2">
          {t('description')}
          {total > 0 && ` Found ${total} match${total !== 1 ? 'es' : ''}.`}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Success message */}
      {updateSuccess && (
        <div className="flex gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-900">{updateSuccess}</p>
        </div>
      )}

      {/* Filters */}
      <MatchFilters
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        buyerIdFilter={buyerIdFilter}
        onBuyerIdFilterChange={setBuyerIdFilter}
        buyers={uniqueBuyers}
      />

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="font-medium text-blue-900">
              {selectedIds.size} match{selectedIds.size !== 1 ? 'es' : ''} selected
            </p>
          </div>
          <button
            onClick={() => handleBulkStatusUpdate('reviewed')}
            disabled={isUpdating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Mark as Reviewed'
            )}
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && matches.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-block p-3 bg-slate-100 rounded-full mb-4">
            <AlertCircle className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-slate-900 font-medium text-lg mb-1">
            {t('noMatches')}
          </p>
          <p className="text-slate-600">
            {t('noMatchesDescription')}
          </p>
        </div>
      )}

      {/* Matches list */}
      {!isLoading && matches.length > 0 && (
        <>
          <MatchesList
            matches={matches}
            selectedIds={selectedIds}
            onSelectAll={toggleSelectAll}
            onSelect={toggleSelect}
            onRefetch={fetchMatches}
            isUpdating={isUpdating}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-slate-600">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={!hasMore}
                className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-slate-50 disabled:opacity-50 text-sm font-medium"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
