'use client'

import { useState } from 'react'

interface Props {
  orgId: string
  listingId: string
  address: string
  orgName: string
}

export default function ListingContactForm({ orgId, listingId, address, orgName }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', honeypot: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || form.honeypot) return  // honeypot block

    setStatus('loading')
    try {
      const res = await fetch('/api/leads/listing-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id:     orgId,
          listing_id: listingId,
          name:       form.name.trim(),
          phone:      form.phone.trim(),
          email:      form.email.trim(),
          message:    form.message.trim() || `I would like to schedule a showing for ${address}.`,
          source_url: window.location.href,
        }),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-4">
        <p className="text-lg font-semibold text-gray-900">Request received!</p>
        <p className="text-sm text-gray-600 mt-1">Someone from {orgName} will reach out shortly to confirm your showing.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Honeypot — hidden, must stay empty */}
      <input
        type="text"
        name="website"
        value={form.honeypot}
        onChange={(e) => setForm(p => ({ ...p, honeypot: e.target.value }))}
        style={{ display: 'none' }}
        tabIndex={-1}
        autoComplete="off"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Jane Smith"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="(555) 867-5309"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
          placeholder="jane@example.com"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          value={form.message}
          onChange={(e) => setForm(p => ({ ...p, message: e.target.value }))}
          placeholder={`I would like to schedule a showing for ${address}.`}
          rows={3}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-600">Something went wrong. Please try again or call us directly.</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-md text-sm disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Sending...' : 'Request a Showing'}
      </button>
    </form>
  )
}
