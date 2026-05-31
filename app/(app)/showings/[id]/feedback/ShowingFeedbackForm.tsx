'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  showing: {
    id: string
    buyer_name: string
  }
}

export default function ShowingFeedbackForm({ showing }: Props) {
  const router = useRouter()
  const [showed, setShowed] = useState<'yes' | 'no' | ''>('')
  const [buyerInterest, setBuyerInterest] = useState<'high' | 'medium' | 'low' | ''>('')
  const [feedback, setFeedback] = useState('')
  const [followUpAction, setFollowUpAction] = useState<
    'schedule_follow_up' | 'send_details' | 'wait_for_buyer' | 'none' | ''
  >('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!showed) {
      setError('Please indicate whether the showing happened')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/showings/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showing.id,
          showed: showed === 'yes',
          buyer_interest: showed === 'yes' ? buyerInterest || null : null,
          feedback: feedback.trim() || null,
          follow_up_action: followUpAction || null,
        }),
      })

      if (res.ok) {
        router.push('/today?focus=1')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to save feedback')
      }
    } catch (err) {
      console.error('Error saving feedback:', err)
      setError('Failed to save feedback')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Did the showing happen? */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Did the showing happen?
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="showed"
              value="yes"
              checked={showed === 'yes'}
              onChange={(e) => setShowed(e.target.value as 'yes')}
              className="w-4 h-4"
            />
            <span className="text-gray-900">Yes, it happened</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="showed"
              value="no"
              checked={showed === 'no'}
              onChange={(e) => setShowed(e.target.value as 'no')}
              className="w-4 h-4"
            />
            <span className="text-gray-900">No, no-show</span>
          </label>
        </div>
      </fieldset>

      {/* Buyer interest (only if showed === yes) */}
      {showed === 'yes' && (
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-3">
            Buyer interest level
          </legend>
          <div className="space-y-2">
            {[
              { value: 'high', label: 'High - Very interested' },
              { value: 'medium', label: 'Medium - Somewhat interested' },
              { value: 'low', label: 'Low - Just looking' },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="radio"
                  name="interest"
                  value={option.value}
                  checked={buyerInterest === option.value}
                  onChange={(e) =>
                    setBuyerInterest(e.target.value as typeof buyerInterest)
                  }
                  className="w-4 h-4"
                />
                <span className="text-gray-900">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Feedback notes */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Feedback notes
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={
            showed === 'yes'
              ? 'E.g., "Loved the master bath, concerned about lot size, will talk to partner"'
              : 'E.g., "Buyer no-show, no call"'
          }
          rows={4}
          className="w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Follow-up action */}
      {showed === 'yes' && (
        <div>
          <label htmlFor="followup" className="block text-sm font-semibold text-gray-900 mb-2">
            What's next?
          </label>
          <select
            id="followup"
            value={followUpAction}
            onChange={(e) => setFollowUpAction(e.target.value as typeof followUpAction)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an action (optional)</option>
            <option value="schedule_follow_up">Schedule follow-up meeting</option>
            <option value="send_details">Send additional details</option>
            <option value="wait_for_buyer">Wait for buyer to contact</option>
            <option value="none">No follow-up needed</option>
          </select>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!showed || loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded transition"
        >
          {loading ? 'Saving...' : 'Save Feedback'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2.5 rounded transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
