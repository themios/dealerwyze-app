'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import EmbeddedCalendarPanel from '@/components/calendar/EmbeddedCalendarPanel'
import ShowingDossierPanel, {
  type ShowingCustomerDossier,
} from '@/components/showings/ShowingDossierPanel'
import { ShowingFeedbackModal } from './ShowingFeedbackModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShowingRequestStatus = 'pending' | 'confirmed' | 'declined' | 'no_show' | 'closed'

export interface ShowingListing {
  id: string
  address_line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  price?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  property_type?: string | null
  mls_number?: string | null
  status?: string | null
  showing_instructions?: string | null
  agent_notes?: string | null
  overview_enrichment_text?: string | null
  listing_interest?: string | null
}

export interface ShowingRequest {
  id: string
  status: ShowingRequestStatus
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  customer_id?: string | null
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
  customersById: Record<string, ShowingCustomerDossier>
}

export default function ShowingsDashboard({
  initialShowings,
  customersById,
}: ShowingsDashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showings, setShowings] = useState<ShowingRequest[]>(initialShowings)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDossierOpen, setMobileDossierOpen] = useState(false)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  const [updateError, setUpdateError] = useState<Record<string, string>>({})
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)

  // Filter by tab
  const filtered = showings.filter((sr) => {
    if (filter === 'all') return true
    if (filter === 'upcoming') return isUpcoming(sr)
    if (filter === 'pending') return sr.status === 'pending'
    if (filter === 'completed') return isCompleted(sr)
    if (filter === 'no_show') return isNoShow(sr)
    return true
  })

  const selectedShowing = useMemo(
    () => filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('showing')
    if (fromUrl && filtered.some((s) => s.id === fromUrl)) {
      setSelectedId(fromUrl)
      setMobileDossierOpen(true)
    }
  }, [searchParams, filtered])

  function selectShowing(id: string, openMobile = true) {
    setSelectedId(id)
    if (openMobile) setMobileDossierOpen(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set('showing', id)
    router.replace(`/showings?${params.toString()}`, { scroll: false })
  }

  function renderShowingActions(sr: ShowingRequest) {
    const showFeedbackBtn =
      sr.status === 'confirmed' && sr.confirmed_time && new Date(sr.confirmed_time) < new Date()

    return (
      <>
        {sr.status === 'pending' && (
          <>
            <button
              type="button"
              disabled={statusUpdating[sr.id]}
              onClick={() => {
                const time =
                  sr.requested_time_1 || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                handleConfirm(sr.id, time)
              }}
              className="rounded text-xs lg:text-xs h-10 lg:h-8 min-h-[44px] lg:min-h-auto px-2.5 py-1.5 lg:py-1.5 lg:px-2.5 bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 w-full lg:w-auto"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={statusUpdating[sr.id]}
              onClick={() => handleDecline(sr.id)}
              className="rounded text-xs lg:text-xs h-10 lg:h-8 min-h-[44px] lg:min-h-auto px-2.5 py-1.5 lg:py-1.5 lg:px-2.5 border border-input bg-background hover:bg-accent transition-colors disabled:opacity-50 w-full lg:w-auto"
            >
              Decline
            </button>
            <Link
              href={`/showings/${sr.id}`}
              className="rounded text-xs lg:text-xs h-10 lg:h-8 min-h-[44px] lg:min-h-auto px-2.5 py-1.5 lg:py-1.5 lg:px-2.5 border border-input hover:bg-accent transition-colors inline-flex items-center justify-center w-full lg:w-auto"
            >
              Full workflow
            </Link>
          </>
        )}
        {showFeedbackBtn && (
          <button
            type="button"
            onClick={() => setFeedbackModalOpen(sr.id)}
            className="rounded text-xs lg:text-xs h-10 lg:h-8 min-h-[44px] lg:min-h-auto px-2.5 py-1.5 lg:py-1.5 lg:px-2.5 bg-blue-600 text-white hover:bg-blue-700 transition-colors w-full lg:w-auto"
          >
            Collect feedback
          </button>
        )}
        {updateError[sr.id] && (
          <p className="w-full text-xs text-red-600">{updateError[sr.id]}</p>
        )}
      </>
    )
  }

  async function handleConfirm(showingId: string, confirmedTime: string) {
    setStatusUpdating((prev) => ({ ...prev, [showingId]: true }))
    setUpdateError((prev) => ({ ...prev, [showingId]: '' }))
    try {
      const res = await fetch('/api/showings/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showingId,
          confirmed_time: new Date(confirmedTime).toISOString(),
        }),
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
      setCalendarRefreshKey((k) => k + 1)
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
      <EmbeddedCalendarPanel refreshKey={calendarRefreshKey} />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 border-b">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 lg:py-2 h-10 lg:h-8 min-h-[44px] lg:min-h-auto text-sm lg:text-sm font-medium transition-colors border-b-2 flex items-center ${
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

      {/* Master–detail dossier */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? 'No showing requests yet. They will appear here when buyers request showings from your listings.'
              : `No ${FILTER_TABS.find((t) => t.value === filter)?.label?.toLowerCase()} requests.`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden min-h-[520px] flex flex-col">
          <div className="hidden lg:flex flex-1 min-h-0">
            {/* List column */}
            <div className="w-[min(100%,340px)] shrink-0 border-r overflow-y-auto max-h-[70vh]">
              <ul className="divide-y">
                {filtered.map((sr) => {
                  const isSelected = selectedShowing?.id === sr.id
                  return (
                    <li key={sr.id}>
                      <button
                        type="button"
                        onClick={() => selectShowing(sr.id, false)}
                        className={`w-full text-left px-3 py-3 transition-colors hover:bg-muted/50 ${
                          isSelected ? 'bg-muted/60 border-l-2 border-l-[#F07018]' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{sr.buyer_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {listingAddress(sr.listing)}
                            </p>
                          </div>
                          <Badge
                            className={`${STATUS_BADGE_CLASS[sr.status]} shrink-0 text-[10px] px-1.5`}
                          >
                            {STATUS_LABELS[sr.status]}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {/* Dossier column */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {selectedShowing ? (
                <ShowingDossierPanel
                  showing={selectedShowing}
                  customer={
                    selectedShowing.customer_id
                      ? customersById[selectedShowing.customer_id] ?? null
                      : null
                  }
                  actions={renderShowingActions(selectedShowing)}
                />
              ) : null}
            </div>
          </div>

          {/* Mobile: list or dossier */}
          <div className="lg:hidden flex flex-col flex-1 min-h-0">
            {!mobileDossierOpen ? (
              <ul className="divide-y overflow-y-auto">
                {filtered.map((sr) => (
                  <li key={sr.id}>
                    <button
                      type="button"
                      onClick={() => selectShowing(sr.id, true)}
                      className="w-full text-left px-4 py-3 lg:py-3 min-h-[44px] hover:bg-muted/50 flex flex-col justify-center"
                    >
                      <p className="font-medium text-sm">{sr.buyer_name}</p>
                      <p className="text-xs text-muted-foreground">{listingAddress(sr.listing)}</p>
                      <Badge className={`${STATUS_BADGE_CLASS[sr.status]} mt-1 text-[10px] w-fit`}>
                        {STATUS_LABELS[sr.status]}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <button
                  type="button"
                  className="shrink-0 px-4 py-2 text-sm text-primary border-b text-left hover:bg-muted/30"
                  onClick={() => {
                    setMobileDossierOpen(false)
                    const params = new URLSearchParams(searchParams.toString())
                    params.delete('showing')
                    const q = params.toString()
                    router.replace(q ? `/showings?${q}` : '/showings', { scroll: false })
                  }}
                >
                  ← All requests
                </button>
                <ShowingDossierPanel
                  showing={selectedShowing}
                  customer={
                    selectedShowing.customer_id
                      ? customersById[selectedShowing.customer_id] ?? null
                      : null
                  }
                  actions={renderShowingActions(selectedShowing)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {feedbackModalOpen && selectedShowing && feedbackModalOpen === selectedShowing.id && (
        <ShowingFeedbackModal
          showing={selectedShowing}
          onClose={() => setFeedbackModalOpen(null)}
          onSubmitted={() => handleFeedbackSubmitted(selectedShowing.id)}
        />
      )}
    </div>
  )
}
