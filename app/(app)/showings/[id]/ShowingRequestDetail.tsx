'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, Calendar } from 'lucide-react'

interface ShowingRequest {
  id: string
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  requested_time_1?: string
  requested_time_2?: string
  requested_time_3?: string
  message?: string
  status: string
  confirmed_time?: string
  vehicle?: {
    address_line1: string
    city: string
    state: string
    zip: string
  }
}

export default function ShowingRequestDetail({ showing }: { showing: ShowingRequest }) {
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'confirm' | 'decline' | 'propose'>(
    'view'
  )
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [proposedTime, setProposedTime] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const address = showing.vehicle
    ? `${showing.vehicle.address_line1}, ${showing.vehicle.city}, ${showing.vehicle.state} ${showing.vehicle.zip}`
    : 'Property'

  const requestedTimes = [
    showing.requested_time_1,
    showing.requested_time_2,
    showing.requested_time_3,
  ].filter((t): t is string => !!t)

  async function handleConfirm() {
    if (!selectedTime) {
      setError('Please select a time')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/showings/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showing.id,
          confirmed_time: selectedTime,
        }),
      })

      if (res.ok) {
        router.push('/today?focus=1')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to confirm showing')
      }
    } catch (err) {
      console.error('Error confirming showing:', err)
      setError('Failed to confirm showing')
    } finally {
      setLoading(false)
    }
  }

  async function handleDecline() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/showings/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showing.id,
          message: message || undefined,
        }),
      })

      if (res.ok) {
        router.push('/today?focus=1')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to decline showing')
      }
    } catch (err) {
      console.error('Error declining showing:', err)
      setError('Failed to decline showing')
    } finally {
      setLoading(false)
    }
  }

  async function handlePropose() {
    if (!proposedTime) {
      setError('Please select a time')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/showings/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showing_id: showing.id,
          proposed_time: proposedTime,
        }),
      })

      if (res.ok) {
        setMode('view')
        setProposedTime('')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to propose time')
      }
    } catch (err) {
      console.error('Error proposing time:', err)
      setError('Failed to propose time')
    } finally {
      setLoading(false)
    }
  }

  if (showing.status === 'confirmed') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Showing Confirmed</h1>
            <p className="text-gray-600 mt-1">{address}</p>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-green-900 mb-1">Confirmed time</p>
          <p className="text-lg font-semibold text-green-900">
            {showing.confirmed_time
              ? new Date(showing.confirmed_time).toLocaleString()
              : 'Time TBD'}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Buyer:</span>
            <span className="text-gray-900">{showing.buyer_name}</span>
          </div>
          {showing.buyer_email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <a
                href={`mailto:${showing.buyer_email}`}
                className="text-blue-600 hover:underline"
              >
                {showing.buyer_email}
              </a>
            </div>
          )}
          {showing.buyer_phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <a
                href={`tel:${showing.buyer_phone}`}
                className="text-blue-600 hover:underline"
              >
                {showing.buyer_phone}
              </a>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/today')}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded transition"
          >
            Back to Today
          </button>
          <button
            onClick={() => router.push(`/showings/${showing.id}/feedback`)}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 rounded transition"
          >
            Add Feedback Later
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Showing Request
        </h1>
        <p className="text-gray-600">{address}</p>
      </div>

      {/* Buyer info */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-blue-900 mb-3">Buyer info</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{showing.buyer_name}</span>
          </div>
          {showing.buyer_email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4" />
              <a
                href={`mailto:${showing.buyer_email}`}
                className="text-blue-600 hover:underline"
              >
                {showing.buyer_email}
              </a>
            </div>
          )}
          {showing.buyer_phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4" />
              <a
                href={`tel:${showing.buyer_phone}`}
                className="text-blue-600 hover:underline"
              >
                {showing.buyer_phone}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Requested times */}
      {requestedTimes.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Buyer's preferred times
          </p>
          <div className="space-y-2">
            {requestedTimes.map((time, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-gray-900"
              >
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{new Date(time).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message */}
      {showing.message && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Message</p>
          <p className="text-gray-600 bg-gray-50 p-3 rounded">
            {showing.message}
          </p>
        </div>
      )}

      {/* Actions */}
      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {mode === 'view' && (
        <div className="flex gap-3">
          <button
            onClick={() => setMode('confirm')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded transition"
          >
            Confirm Time
          </button>
          <button
            onClick={() => setMode('propose')}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2.5 rounded transition"
          >
            Propose New Time
          </button>
          <button
            onClick={() => setMode('decline')}
            className="flex-1 border border-red-300 hover:bg-red-50 text-red-700 font-medium py-2.5 rounded transition"
          >
            Decline
          </button>
        </div>
      )}

      {mode === 'confirm' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Select one of the buyer's preferred times
          </p>
          <div className="space-y-2 mb-4">
            {requestedTimes.map((time, idx) => (
              <label key={idx} className="flex items-center gap-3 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="time"
                  value={time}
                  checked={selectedTime === time}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="flex-1">{new Date(time).toLocaleString()}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={!selectedTime || loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2 rounded transition"
            >
              {loading ? 'Confirming...' : 'Confirm & Notify'}
            </button>
            <button
              onClick={() => setMode('view')}
              disabled={loading}
              className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 rounded transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Optional: Tell them why (will be sent in SMS)
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="E.g., 'Showing available only after 6pm tomorrow'"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDecline}
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2 rounded transition"
            >
              {loading ? 'Declining...' : 'Decline & Notify'}
            </button>
            <button
              onClick={() => {
                setMode('view')
                setMessage('')
              }}
              disabled={loading}
              className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 rounded transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'propose' && (
        <div>
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Pick a time that works for you
            </p>
            <input
              type="datetime-local"
              value={proposedTime}
              onChange={(e) => setProposedTime(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handlePropose}
              disabled={!proposedTime || loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded transition"
            >
              {loading ? 'Proposing...' : 'Propose & Notify'}
            </button>
            <button
              onClick={() => {
                setMode('view')
                setProposedTime('')
              }}
              disabled={loading}
              className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 rounded transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
