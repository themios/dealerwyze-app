'use client'

import { useState } from 'react'

const CONDITIONS = [
  { value: 'excellent', label: 'Excellent', desc: 'Like new, no issues' },
  { value: 'good', label: 'Good', desc: 'Minor wear, runs great' },
  { value: 'fair', label: 'Fair', desc: 'Some issues, still drivable' },
  { value: 'poor', label: 'Poor', desc: 'Needs significant work' },
]

interface Props {
  orgId: string
  vehicleId: string
  vehicleName: string
}

export default function TradeInForm({ orgId, vehicleId, vehicleName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    year: '',
    make: '',
    model: '',
    mileage: '',
    condition: '',
    name: '',
    phone: '',
  })
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (honeypot) return // bot
    if (!form.year || !form.make || !form.model || !form.condition || !form.name || !form.phone) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    setError(null)
    const message = `Trade-in inquiry:\n${form.year} ${form.make} ${form.model}\nMileage: ${form.mileage || 'Not provided'}\nCondition: ${form.condition}\n\nInterested in: ${vehicleName}`
    try {
      const res = await fetch('/api/leads/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          vehicle_id: vehicleId,
          name: form.name,
          phone: form.phone,
          message,
          source_url: typeof window !== 'undefined' ? window.location.href : '',
          website: honeypot,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError('Something went wrong. Please call us directly.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
        <div className="text-3xl mb-2">✓</div>
        <p className="font-semibold text-green-800">Trade-in request received!</p>
        <p className="text-sm text-green-700 mt-1">We'll contact you shortly with an estimated value.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="text-left">
          <p className="font-semibold text-gray-800 text-sm">Have a vehicle to trade in?</p>
          <p className="text-xs text-gray-500">Get an estimate from us</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Honeypot */}
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your vehicle</p>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" inputMode="numeric" maxLength={4}
              placeholder="Year *"
              value={form.year} onChange={e => set('year', e.target.value)}
              className="col-span-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Make *"
              value={form.make} onChange={e => set('make', e.target.value)}
              className="col-span-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Model *"
              value={form.model} onChange={e => set('model', e.target.value)}
              className="col-span-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text" inputMode="numeric"
              placeholder="Mileage"
              value={form.mileage} onChange={e => set('mileage', e.target.value)}
              className="col-span-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => set('condition', c.value)}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                  form.condition === c.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-xs font-semibold">{c.label}</p>
                <p className="text-[10px] text-gray-500">{c.desc}</p>
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Your contact info</p>

          <input
            type="text"
            placeholder="Your name *"
            value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="tel"
            placeholder="Phone number *"
            value={form.phone} onChange={e => set('phone', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Get trade-in estimate'}
          </button>
        </form>
      )}
    </div>
  )
}
