'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShowingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

interface ShowingContact {
  id: string
  name: string | null
  primary_phone: string | null
  email: string | null
}

interface ShowingAgent {
  id: string
  full_name: string | null
}

interface ShowingRow {
  id: string
  scheduled_at: string
  status: ShowingStatus
  feedback_json: { interest_level?: string | null; price_feedback?: string | null; objections?: string | null; notes?: string | null } | null
  gcal_event_id: string | null
  cal_booking_uid: string | null
  cal_link: string | null
  created_at: string
  contact: ShowingContact | null
  agent: ShowingAgent | null
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShowingTimelineProps {
  listingId: string
  orgId: string
  calcomUsername?: string | null
  calcomEventSlug?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
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

const STATUS_OPTIONS: ShowingStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShowingTimeline({
  listingId,
  orgId,
  calcomUsername,
  calcomEventSlug,
}: ShowingTimelineProps) {
  const [showings, setShowings] = useState<ShowingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // Feedback note state — keyed by showing id
  const [feedbackOpen, setFeedbackOpen] = useState<Record<string, boolean>>({})
  const [feedbackNote, setFeedbackNote] = useState<Record<string, string>>({})
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<Record<string, boolean>>({})

  // Status update optimistic — track per showing
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchShowings = useCallback(async () => {
    setFetchError(false)
    try {
      const res = await fetch(`/api/showings?listing_id=${listingId}`)
      if (!res.ok) throw new Error('non-200')
      const data: ShowingRow[] = await res.json()
      setShowings(data)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => {
    void fetchShowings()
  }, [fetchShowings])

  // ---------------------------------------------------------------------------
  // Status update
  // ---------------------------------------------------------------------------

  async function handleStatusChange(showingId: string, newStatus: ShowingStatus) {
    setStatusUpdating(prev => ({ ...prev, [showingId]: true }))
    try {
      const res = await fetch(`/api/showings/${showingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) return
      // Optimistic update — re-fetch to be consistent
      await fetchShowings()
    } finally {
      setStatusUpdating(prev => ({ ...prev, [showingId]: false }))
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule form
  // ---------------------------------------------------------------------------

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setScheduleError(null)

    if (!scheduleDate || !scheduleTime) {
      setScheduleError('Date and time are required.')
      return
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
    if (new Date(scheduledAt) <= new Date()) {
      setScheduleError('Showing must be scheduled in the future.')
      return
    }

    setScheduleSubmitting(true)
    try {
      const res = await fetch('/api/showings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          scheduled_at: scheduledAt,
          notes: scheduleNotes || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setScheduleError((body as { error?: string }).error ?? 'Failed to schedule showing.')
        return
      }
      setShowScheduleForm(false)
      setScheduleDate('')
      setScheduleTime('')
      setScheduleNotes('')
      await fetchShowings()
    } catch {
      setScheduleError('Failed to schedule showing. Please try again.')
    } finally {
      setScheduleSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback notes
  // ---------------------------------------------------------------------------

  async function handleFeedbackSave(showingId: string) {
    setFeedbackSubmitting(prev => ({ ...prev, [showingId]: true }))
    try {
      const res = await fetch(`/api/showings/${showingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_notes: feedbackNote[showingId] ?? '' }),
      })
      if (!res.ok) return
      setFeedbackOpen(prev => ({ ...prev, [showingId]: false }))
      await fetchShowings()
    } finally {
      setFeedbackSubmitting(prev => ({ ...prev, [showingId]: false }))
    }
  }

  // ---------------------------------------------------------------------------
  // Cal.com link
  // ---------------------------------------------------------------------------

  const calLink =
    calcomUsername && calcomEventSlug
      ? `https://cal.com/${calcomUsername}/${calcomEventSlug}?metadata[orgId]=${orgId}&metadata[listingId]=${listingId}`
      : null

  const [calCopied, setCalCopied] = useState(false)
  function handleCopyCalLink() {
    if (!calLink) return
    void navigator.clipboard.writeText(calLink).then(() => {
      setCalCopied(true)
      setTimeout(() => setCalCopied(false), 2000)
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="mt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Showings</h2>
        <Button
          size="sm"
          onClick={() => {
            setShowScheduleForm(v => !v)
            setScheduleError(null)
          }}
        >
          {showScheduleForm ? 'Cancel' : 'Schedule Showing'}
        </Button>
      </div>

      {/* Cal.com self-serve booking link */}
      {calLink && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-900">Self-serve booking link</p>
          <p className="text-xs text-blue-700">Share this link with buyers for self-serve booking.</p>
          <div className="flex items-center gap-2 mt-1">
            <input
              readOnly
              value={calLink}
              className="flex-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs font-mono text-gray-700 truncate"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopyCalLink}
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {calCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Schedule form */}
      {showScheduleForm && (
        <form
          onSubmit={handleScheduleSubmit}
          className="rounded-lg border bg-card p-4 space-y-3"
        >
          <p className="text-sm font-semibold">Schedule a Showing</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
            <textarea
              value={scheduleNotes}
              onChange={e => setScheduleNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Buyer name, access code, instructions…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm resize-none"
            />
          </div>
          {scheduleError && (
            <p className="text-xs text-red-600">{scheduleError}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={scheduleSubmitting}>
              {scheduleSubmitting ? 'Saving…' : 'Save Showing'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setShowScheduleForm(false); setScheduleError(null) }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading showings…</div>
      ) : fetchError ? (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-sm text-red-600">Failed to load showings.</p>
          <Button size="sm" variant="ghost" onClick={() => { setLoading(true); void fetchShowings() }}>
            Retry
          </Button>
        </div>
      ) : showings.length === 0 ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No showings scheduled yet. Click &quot;Schedule Showing&quot; to add one.
        </div>
      ) : (
        <div className="space-y-2">
          {showings.map(showing => {
            const isFeedbackOpen = feedbackOpen[showing.id] ?? false
            return (
              <div key={showing.id} className="rounded-lg border bg-card p-3 space-y-2">
                {/* Row: date/time + status + buyer + agent */}
                <div className="flex flex-wrap items-start gap-2 justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{formatDateTime(showing.scheduled_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      {showing.contact?.name ?? 'No contact'} &middot; {showing.agent?.full_name ?? 'No agent'}
                    </p>
                  </div>
                  <Badge className={STATUS_BADGE_CLASS[showing.status]}>
                    {STATUS_LABELS[showing.status]}
                  </Badge>
                </div>

                {/* Notes preview */}
                {showing.feedback_json?.notes && (
                  <p className="text-xs text-muted-foreground italic truncate">{showing.feedback_json.notes}</p>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Status change buttons — skip current status */}
                  {STATUS_OPTIONS.filter(s => s !== showing.status).map(s => (
                    <button
                      key={s}
                      type="button"
                      disabled={statusUpdating[showing.id]}
                      onClick={() => handleStatusChange(showing.id, s)}
                      className="rounded text-xs px-2 py-0.5 border border-input bg-background hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      Mark {STATUS_LABELS[s]}
                    </button>
                  ))}

                  {/* Feedback notes toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackOpen(prev => ({ ...prev, [showing.id]: !isFeedbackOpen }))
                      if (!feedbackNote[showing.id]) {
                        setFeedbackNote(prev => ({ ...prev, [showing.id]: showing.feedback_json?.notes ?? '' }))
                      }
                    }}
                    className="rounded text-xs px-2 py-0.5 border border-input bg-background hover:bg-accent transition-colors"
                  >
                    {isFeedbackOpen ? 'Close notes' : 'Add/edit notes'}
                  </button>
                </div>

                {/* Inline feedback note editor */}
                {isFeedbackOpen && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={feedbackNote[showing.id] ?? ''}
                      onChange={e => setFeedbackNote(prev => ({ ...prev, [showing.id]: e.target.value }))}
                      rows={2}
                      maxLength={2000}
                      placeholder="Buyer feedback, interest level, objections…"
                      className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={feedbackSubmitting[showing.id]}
                        onClick={() => handleFeedbackSave(showing.id)}
                        className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {feedbackSubmitting[showing.id] ? 'Saving…' : 'Save notes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackOpen(prev => ({ ...prev, [showing.id]: false }))}
                        className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
