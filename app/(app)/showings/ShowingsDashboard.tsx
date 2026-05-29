'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShowingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

interface ShowingListing {
  id: string
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
}

interface ShowingContact {
  id: string
  name: string | null
  primary_phone: string | null
}

interface ShowingAgent {
  id: string
  full_name: string | null
}

export interface UpcomingShowing {
  id: string
  scheduled_at: string
  status: ShowingStatus
  org_id: string
  listing_id: string
  listing: ShowingListing | null
  contact: ShowingContact | null
  agent: ShowingAgent | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

function listingAddress(l: ShowingListing | null): string {
  if (!l) return 'Unknown listing'
  return [l.address_line1, l.city, l.state, l.zip].filter(Boolean).join(', ')
}

const STATUS_LABELS: Record<ShowingStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const STATUS_BADGE_CLASS: Record<ShowingStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
}

type FilterStatus = 'all' | ShowingStatus

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-show' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ShowingsDashboardProps {
  initialShowings: UpcomingShowing[]
}

export default function ShowingsDashboard({ initialShowings }: ShowingsDashboardProps) {
  const [showings, setShowings] = useState<UpcomingShowing[]>(initialShowings)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  const [updateError, setUpdateError] = useState<Record<string, string>>({})

  const filtered = filter === 'all' ? showings : showings.filter(s => s.status === filter)

  async function handleStatusChange(showingId: string, newStatus: ShowingStatus) {
    setStatusUpdating(prev => ({ ...prev, [showingId]: true }))
    setUpdateError(prev => ({ ...prev, [showingId]: '' }))
    try {
      const res = await fetch(`/api/showings/${showingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setUpdateError(prev => ({ ...prev, [showingId]: 'Update failed. Please try again.' }))
        return
      }
      // Update local state — optimistic then confirm
      setShowings(prev =>
        prev.map(s => s.id === showingId ? { ...s, status: newStatus } : s)
      )
    } catch {
      setUpdateError(prev => ({ ...prev, [showingId]: 'Update failed. Please try again.' }))
    } finally {
      setStatusUpdating(prev => ({ ...prev, [showingId]: false }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Status filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} showing{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? 'No upcoming showings in the next 30 days. Schedule one from a listing page.'
              : `No ${STATUS_LABELS[filter as ShowingStatus]?.toLowerCase() ?? filter} showings.`}
          </p>
          <Link
            href="/vehicles"
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            Go to listings &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(showing => {
            const addr = listingAddress(showing.listing)
            return (
              <div key={showing.id} className="rounded-lg border bg-card p-4 space-y-2">
                {/* Row: date/time, address, status, buyer, agent */}
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {formatDateTime(showing.scheduled_at)}
                    </p>
                    {/* Listing address — links to listing detail page */}
                    <Link
                      href={`/listings/${showing.listing_id}`}
                      className="text-sm text-primary hover:underline block truncate"
                    >
                      {addr}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {showing.contact?.name ?? 'No contact'}
                      {showing.agent?.full_name ? ` · ${showing.agent.full_name}` : ''}
                    </p>
                  </div>
                  <Badge className={`${STATUS_BADGE_CLASS[showing.status]} shrink-0`}>
                    {STATUS_LABELS[showing.status]}
                  </Badge>
                </div>

                {/* Status update controls */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {((['scheduled', 'completed', 'cancelled', 'no_show'] as ShowingStatus[])
                    .filter(s => s !== showing.status))
                    .map(s => (
                      <button
                        key={s}
                        type="button"
                        disabled={statusUpdating[showing.id]}
                        onClick={() => handleStatusChange(showing.id, s)}
                        className="rounded text-xs px-2 py-0.5 border border-input bg-background hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        Mark {STATUS_LABELS[s]}
                      </button>
                    ))
                  }
                  <Link
                    href={`/listings/${showing.listing_id}`}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View listing &rarr;
                  </Link>
                </div>

                {/* Inline error */}
                {updateError[showing.id] && (
                  <p className="text-xs text-red-600">{updateError[showing.id]}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
