'use client'

import { useState } from 'react'

interface Props {
  orgId: string
  listingId: string
  address: string
  orgName: string
}

interface FormState {
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  requestedTime1: string
  requestedTime2: string
  requestedTime3: string
  message: string
  honeypot: string
}

export default function ShowingRequestForm({
  orgId,
  listingId,
  address,
  orgName,
}: Props) {
  const [form, setForm] = useState<FormState>({
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    requestedTime1: '',
    requestedTime2: '',
    requestedTime3: '',
    message: '',
    honeypot: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Honeypot check
    if (!form.buyerName.trim() || form.honeypot) return

    // Validation: need name and email
    if (!form.buyerEmail.trim()) {
      alert('Email is required')
      return
    }

    setStatus('loading')
    try {
      const requestedTimes = [
        form.requestedTime1,
        form.requestedTime2,
        form.requestedTime3,
      ]
        .filter((t) => t.trim())
        .map((t) => {
          try {
            return new Date(t).toISOString()
          } catch {
            return null
          }
        })
        .filter((t) => t !== null)

      const res = await fetch('/api/showings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          listing_id: listingId,
          buyer_name: form.buyerName.trim(),
          buyer_email: form.buyerEmail.trim(),
          buyer_phone: form.buyerPhone.trim() || undefined,
          requested_times: requestedTimes.length > 0 ? requestedTimes : undefined,
          message: form.message.trim() || undefined,
          source_url: window.location.href,
        }),
      })

      if (res.ok) {
        setStatus('success')
      } else {
        const errData = await res.json().catch(() => ({}))
        console.error('Request failed:', errData)
        setStatus('error')
      }
    } catch (err) {
      console.error('Submission error:', err)
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-6">
        <p className="text-lg font-semibold text-gray-900">Thank you!</p>
        <p className="text-sm text-gray-600 mt-2">
          Your showing request has been sent to {orgName}. Check your email for
          confirmation, and the agent will reach out shortly to confirm a time.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={form.honeypot}
        onChange={(e) => setForm((p) => ({ ...p, honeypot: e.target.value }))}
        style={{ display: 'none' }}
        tabIndex={-1}
        autoComplete="off"
      />

      {/* Buyer Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Name *
          </label>
          <input
            type="text"
            required
            value={form.buyerName}
            onChange={(e) =>
              setForm((p) => ({ ...p, buyerName: e.target.value }))
            }
            placeholder="Jane Smith"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Email *
          </label>
          <input
            type="email"
            required
            value={form.buyerEmail}
            onChange={(e) =>
              setForm((p) => ({ ...p, buyerEmail: e.target.value }))
            }
            placeholder="jane@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Your Phone
        </label>
        <input
          type="tel"
          value={form.buyerPhone}
          onChange={(e) =>
            setForm((p) => ({ ...p, buyerPhone: e.target.value }))
          }
          placeholder="(555) 867-5309"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Preferred Times */}
      <fieldset className="border-t pt-4">
        <legend className="text-sm font-medium text-gray-700 mb-3">
          Your preferred showing times
        </legend>
        {[1, 2, 3].map((idx) => (
          <div key={idx} className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {idx === 1 ? 'First choice' : idx === 2 ? 'Second choice' : 'Third choice'} (optional)
            </label>
            <input
              type="datetime-local"
              value={
                idx === 1
                  ? form.requestedTime1
                  : idx === 2
                    ? form.requestedTime2
                    : form.requestedTime3
              }
              onChange={(e) => {
                const key =
                  idx === 1
                    ? 'requestedTime1'
                    : idx === 2
                      ? 'requestedTime2'
                      : 'requestedTime3'
                setForm((p) => ({ ...p, [key]: e.target.value }))
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </fieldset>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional message
        </label>
        <textarea
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          placeholder="E.g., 'I'm particularly interested in the kitchen renovation...'"
          rows={3}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error message */}
      {status === 'error' && (
        <p className="text-sm text-red-600">
          Something went wrong. Please try again or call the agent directly.
        </p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-md text-sm disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Sending request...' : 'Request a Showing'}
      </button>
    </form>
  )
}
