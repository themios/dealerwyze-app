'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import type { ShowingRequest } from './ShowingsDashboard'

interface ShowingFeedbackModalProps {
  showing: ShowingRequest
  onClose: () => void
  onSubmitted: () => void
}

export function ShowingFeedbackModal({ showing, onClose, onSubmitted }: ShowingFeedbackModalProps) {
  const [showed, setShowed] = useState(true)
  const [buyerInterest, setBuyerInterest] = useState<'high' | 'medium' | 'low'>('medium')
  const [feedback, setFeedback] = useState('')
  const [followUpAction, setFollowUpAction] = useState<'schedule_follow_up' | 'send_details' | 'wait_for_buyer' | 'none'>('none')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/showings/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showing.id,
          showed,
          buyer_interest: showed ? buyerInterest : null,
          feedback: feedback || null,
          follow_up_action: showed ? followUpAction : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to submit feedback' }))
        setError(err.error || 'Failed to submit feedback')
        return
      }

      onSubmitted()
    } catch {
      setError('Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-background w-full max-w-md rounded-t-lg shadow-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Showing Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Showing details */}
        <div className="bg-muted p-3 rounded text-sm">
          <p className="font-medium text-foreground">
            {showing.customer_id ? (
              <Link href={`/customers/${showing.customer_id}`} className="text-primary hover:underline">
                {showing.buyer_name}
              </Link>
            ) : (
              showing.buyer_name
            )}
          </p>
          <p className="text-muted-foreground">{showing.listing?.address_line1}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Did the showing occur? */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showed}
                onChange={(e) => setShowed(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-foreground">Showing occurred</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Uncheck if the buyer did not show up
            </p>
          </div>

          {/* Buyer interest (only if showed) */}
          {showed && (
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Buyer interest level</label>
              <div className="space-y-2">
                {['high', 'medium', 'low'].map((level) => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="interest"
                      value={level}
                      checked={buyerInterest === level}
                      onChange={(e) => setBuyerInterest(e.target.value as 'high' | 'medium' | 'low')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-foreground capitalize">{level}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Notes</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Any observations, questions from the buyer, or next steps..."
              className="w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
            />
          </div>

          {/* Follow-up action (only if showed) */}
          {showed && (
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Follow-up action</label>
              <select
                value={followUpAction}
                onChange={(e) => setFollowUpAction(e.target.value as 'schedule_follow_up' | 'send_details' | 'wait_for_buyer' | 'none')}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="none">None</option>
                <option value="schedule_follow_up">Schedule follow-up meeting</option>
                <option value="send_details">Send listing details</option>
                <option value="wait_for_buyer">Wait for buyer to contact</option>
              </select>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
