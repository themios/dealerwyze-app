'use client'

import { useEffect, useState } from 'react'

interface OrgInfo {
  dealer_name: string
  dealer_phone: string | null
  intro_text: string | null
  timezone: string
}

// Generate time slots every 30 min between 9am–6pm
function getTimeSlots() {
  const slots: { value: string; label: string }[] = []
  for (let h = 9; h < 18; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const ampm = h < 12 ? 'AM' : 'PM'
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
      slots.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${ampm}` })
    }
  }
  return slots
}

// Generate next 14 available days (Mon–Sat, skip Sun)
function getAvailableDates() {
  const dates: { value: string; label: string }[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Start tomorrow
  d.setDate(d.getDate() + 1)
  while (dates.length < 14) {
    if (d.getDay() !== 0) { // skip Sunday
      const value = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      dates.push({ value, label })
    }
    d.setDate(d.getDate() + 1)
  }
  return dates
}

const TIME_SLOTS  = getTimeSlots()
const AVAIL_DATES = getAvailableDates()

export default function BookingForm({ slug }: { slug: string }) {
  const [org, setOrg]         = useState<OrgInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [date, setDate]   = useState(AVAIL_DATES[0]?.value ?? '')
  const [time, setTime]   = useState(TIME_SLOTS[2]?.value ?? '10:00') // default 10:00 AM
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [errMsg, setErrMsg]         = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/book/${slug}`)
      .then(r => r.json())
      .then((data: OrgInfo & { error?: string }) => {
        if (data.error) { setLoadErr(data.error); return }
        setOrg(data)
      })
      .catch(() => setLoadErr('Could not load booking page'))
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrMsg(null)
    if (!name.trim() || !phone.trim() || !date || !time) {
      setErrMsg('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, phone, email, date, time, notes, website: '' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrMsg(data.error ?? 'Something went wrong. Please try again.')
      } else {
        setSuccess(true)
      }
    } catch {
      setErrMsg('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadErr) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-gray-700 font-medium">Booking is not available.</p>
        <p className="text-sm text-gray-400">Please contact the dealership directly.</p>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="p-8 text-center">
        <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="text-5xl">✓</div>
        <p className="text-xl font-semibold text-gray-900">You are booked!</p>
        <p className="text-sm text-gray-500">
          {org.dealer_name} will be expecting you.
          {org.dealer_phone && (
            <> If you need to reach us, call{' '}
              <a href={`tel:${org.dealer_phone}`} className="underline">{org.dealer_phone}</a>.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      {/* Honeypot - hidden from real users, bots fill it */}
      <input type="text" name="website" tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} autoComplete="off" />

      {org.intro_text && (
        <p className="text-sm text-gray-600">{org.intro_text}</p>
      )}

      {/* Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Your name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="First Last"
          required
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Phone number <span className="text-red-500">*</span></label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          required
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Email <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Date */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Preferred date <span className="text-red-500">*</span></label>
        <select
          value={date}
          onChange={e => setDate(e.target.value)}
          required
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {AVAIL_DATES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Time */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Preferred time <span className="text-red-500">*</span></label>
        <select
          value={time}
          onChange={e => setTime(e.target.value)}
          required
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          {TIME_SLOTS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any specific cars you want to see, questions, etc."
          rows={3}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
      </div>

      {errMsg && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full h-12 rounded-xl bg-gray-900 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
      >
        {submitting ? 'Booking...' : 'Book My Visit'}
      </button>
    </form>
  )
}
