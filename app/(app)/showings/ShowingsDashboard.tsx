'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ShowingFeedbackModal } from './ShowingFeedbackModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShowingRequestStatus = 'pending' | 'confirmed' | 'declined' | 'no_show' | 'closed'

interface ShowingListing {
  id: string
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface ShowingRequest {
  id: string
  status: ShowingRequestStatus
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  requested_time_1: string | null
  requested_time_2: string | null
  requested_time_3: string | null
  confirmed_time: string | null
  confirmed_at: string | null
  message: string | null
  listing_id: string
  listing: ShowingListing | null
  agent_id: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
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

const STATUS_LABELS: Record<ShowingRequestStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
  no_show: 'No-show',
  closed: 'Closed',
}

const STATUS_BADGE_CLASS: Record<ShowingRequestStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  declined: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
  closed: 'bg-green-100 text-green-800',
}

type FilterTab = 'all' | 'upcoming' | 'pending' | 'completed' | 'no_show'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-shows' },
]

function isUpcoming(sr: ShowingRequest): boolean {
  if (sr.status !== 'confirmed' || !sr.confirmed_time) return false
  const now = new Date()
  const confirmedTime = new Date(sr.confirmed_time)
  return confirmedTime > now
}

function isCompleted(sr: ShowingRequest): boolean {
  return sr.status === 'closed'
}

function isNoShow(sr: ShowingRequest): boolean {
  return sr.status === 'no_show'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ShowingsDashboardProps {
  initialShowings: ShowingRequest[]
}

export default function ShowingsDashboard({ initialShowings }: ShowingsDashboardProps) {
  const [showings, setShowings] = useState<ShowingRequest[]>(initialShowings)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [feedbackModalOpen, setFeedbackModalOpen] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  const [updateError, setUpdateError] = useState<Record<string, string>>({})

  // Filter by tab
  const filtered = showings.filter((sr) => {
    if (filter === 'all') return true
    if (filter === 'upcoming') return isUpcoming(sr)
    if (filter === 'pending') return sr.status === 'pending'
    if (filter === 'completed') return isCompleted(sr)
    if (filter === 'no_show') return isNoShow(sr)
    return true
  })

  async function handleConfirm(showingId: string, confirmedTime: string) {
    setStatusUpdating((prev) => ({ ...prev, [showingId]: true }))
    setUpdateError((prev) => ({ ...prev, [showingId]: '' }))
    try {
      const res = await fetch('/api/showings/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showing_id: showingId, confirmed_time: confirmedTime }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setUpdateError((prev) => ({ ...prev, [showingId]: err.error || 'Confirmation failed' }))
        return
      }
      // Update local state
      setShowings((prev) =>
        prev.map((s) =>
          s.id === showingId
            ? { ...s, status: 'confirmed', confirmed_time: confirmedTime, confirmed_at: new Date().toISOString() }
            : s
        )
      )
    } catch {
      setUpdateError((prev) => ({ ...prev, [showingId]: 'Confirmation failed' }))
    } finally {
      setStatusUpdating((prev) => ({ ...prev, [showingId]: false }))
    }
  }

  async function handleDecline(showingId: string) {
    setStatusUpdating((prev) => ({ ...prev, [showingId]: true }))
    setUpdateError((prev) => ({ ...prev, [showingId]: '' }))
    try {
      const res = await fetch('/api/showings/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showing_id: showingId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setUpdateError((prev) => ({ ...prev, [showingId]: err.error || 'Decline failed' }))
        return
      }
      // Update local state
      setShowings((prev) =>
        prev.map((s) => (s.id === showingId ? { ...s, status: 'declined' } : s))
      )
    } catch {
      setUpdateError((prev) => ({ ...prev, [showingId]: 'Decline failed' }))
    } finally {
      setStatusUpdating((prev) => ({ ...prev, [showingId]: false }))
    }
  }

  function handleFeedbackSubmitted(showingId: string) {
    // Refresh the showing to get updated status
    setShowings((prev) =>
      prev.map((s) => (s.id === showingId ? { ...s, status: 'closed' } : s))
    )
    setFeedbackModalOpen(null)
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 border-b">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              filter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground self-center py-2">
          {filtered.length} {filtered.length === 1 ? 'request' : 'requests'}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? 'No showing requests yet. They will appear here when buyers request showings from your listings.'
              : `No ${FILTER_TABS.find((t) => t.value === filter)?.label?.toLowerCase()} requests.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sr) => {
            const addr = listingAddress(sr.listing)
            const showFeedbackBtn = sr.status === 'confirmed' && sr.confirmed_time && new Date(sr.confirmed_time) < new Date()

            return (
              <div key={sr.id} className="rounded-lg border bg-card p-4 space-y-3">
                {/* Header: buyer, property, status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-foreground">{sr.buyer_name}</p>
                    <Link
                      href={`/listings/${sr.listing_id}`}
                      className="text-sm text-primary hover:underline block truncate"
                    >
                      {addr}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {sr.buyer_email}
                      {sr.buyer_phone ? ` · ${sr.buyer_phone}` : ''}
                    </p>
                  </div>
                  <Badge className={`${STATUS_BADGE_CLASS[sr.status]} shrink-0`}>
                    {STATUS_LABELS[sr.status]}
                  </Badge>
                </div>

                {/* Times */}
                {sr.status === 'pending' && (
                  <div className="text-sm bg-muted p-2 rounded space-y-1">
                    <p className="font-medium text-muted-foreground">Requested times:</p>
                    <ul className="text-xs text-foreground space-y-0.5">
                      {sr.requested_time_1 && <li>1. {formatDateTime(sr.requested_time_1)}</li>}
                      {sr.requested_time_2 && <li>2. {formatDateTime(sr.requested_time_2)}</li>}
                      {sr.requested_time_3 && <li>3. {formatDateTime(sr.requested_time_3)}</li>}
                    </ul>
                    {sr.message && <p className="text-xs italic text-muted-foreground mt-2">Message: {sr.message}</p>}
                  </div>
                )}

                {sr.status === 'confirmed' && sr.confirmed_time && (
                  <div className="text-sm bg-muted p-2 rounded">
                    <p className="font-medium text-muted-foreground">Confirmed for:</p>
                    <p className="text-foreground">{formatDateTime(sr.confirmed_time)}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {sr.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={statusUpdating[sr.id]}
                        onClick={() => {
                          const time = sr.requested_time_1 || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                          handleConfirm(sr.id, time)
                        }}
                        className="rounded text-xs px-2 py-1 bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={statusUpdating[sr.id]}
                        onClick={() => handleDecline(sr.id)}
                        className="rounded text-xs px-2 py-1 border border-input bg-background hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </>
                  )}

                  {showFeedbackBtn && (
                    <button
                      type="button"
                      onClick={() => setFeedbackModalOpen(sr.id)}
                      className="rounded text-xs px-2 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Collect Feedback
                    </button>
                  )}

                  <Link
                    href={`/listings/${sr.listing_id}`}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View listing →
                  </Link>
                </div>

                {/* Error display */}
                {updateError[sr.id] && <p className="text-xs text-red-600">{updateError[sr.id]}</p>}

                {/* Feedback modal */}
                {feedbackModalOpen === sr.id && (
                  <ShowingFeedbackModal
                    showing={sr}
                    onClose={() => setFeedbackModalOpen(null)}
                    onSubmitted={() => handleFeedbackSubmitted(sr.id)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
