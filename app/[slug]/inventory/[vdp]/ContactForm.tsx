'use client'

import { useState } from 'react'

interface Props {
  slug: string
  vdp: string
  vehicleName: string
}

export default function ContactForm({ slug, vdp, vehicleName }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    setStatus('loading')

    try {
      const res = await fetch('/api/leads/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          vdp,
          name: form.name,
          phone: form.phone,
          email: form.email,
          message: form.message,
          source_url: window.location.href,
          website: '', // honeypot (kept empty)
        }),
      })

      if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <div className="text-green-600 mb-2">
          <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="font-semibold text-green-800">Message sent!</h3>
        <p className="text-sm text-green-700 mt-1">
          The dealer will be in touch soon.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Interested in this vehicle?</h2>
      <p className="text-sm text-gray-500 mb-4">{vehicleName}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Honeypot - hidden from humans */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px' }}
          autoComplete="off"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="John Smith"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(555) 555-5555"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="I'm interested in this vehicle..."
          />
        </div>

        {status === 'error' && (
          <p className="text-sm text-red-600">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading' || !form.name.trim()}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {status === 'loading' ? 'Sending...' : 'Send Message'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your information is shared with the dealer only.
        </p>
      </form>
    </div>
  )
}
