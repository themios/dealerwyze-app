'use client'

import { useMemo, useState } from 'react'
import type { BookListingOption, BookPageAgent } from '@/lib/showings/loadBookPageData'
import {
  formatPhoneHint,
  isValidBuyerEmail,
  isValidBuyerPhone,
} from '@/lib/showings/validateBuyerContact'

interface Props {
  orgId: string
  orgName: string
  agent: BookPageAgent | null
  listings: BookListingOption[]
}

interface FormState {
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  propertyQuery: string
  listingId: string
  requestedTime1: string
  requestedTime2: string
  requestedTime3: string
  message: string
  honeypot: string
}

export default function BookShowingForm({
  orgId,
  orgName,
  agent,
  listings,
}: Props) {
  const [form, setForm] = useState<FormState>({
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    propertyQuery: '',
    listingId: '',
    requestedTime1: '',
    requestedTime2: '',
    requestedTime3: '',
    message: '',
    honeypot: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const filteredListings = useMemo(() => {
    const q = form.propertyQuery.trim().toLowerCase()
    if (!q) return listings.slice(0, 12)
    return listings
      .filter((l) => l.label.toLowerCase().includes(q))
      .slice(0, 12)
  }, [form.propertyQuery, listings])

  function selectListing(listing: BookListingOption) {
    setForm((p) => ({
      ...p,
      listingId: listing.id,
      propertyQuery: listing.label,
    }))
    setFieldErrors((e) => ({ ...e, property: '' }))
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!form.buyerName.trim()) errors.name = 'Name is required'
    if (!isValidBuyerEmail(form.buyerEmail)) errors.email = 'Enter a valid email address'
    if (!isValidBuyerPhone(form.buyerPhone)) {
      errors.phone = 'Enter a valid phone number (at least 10 digits)'
    }
    if (!form.listingId) {
      errors.property = 'Select a property from the list or type to search listings'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.honeypot) return
    if (!validate()) return

    setStatus('loading')
    setErrorMessage(null)

    try {
      const requestedTimes = [
        form.requestedTime1,
        form.requestedTime2,
        form.requestedTime3,
      ]
        .filter((t) => t.trim())
        .map((t) => new Date(t).toISOString())

      const res = await fetch('/api/showings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          listing_id: form.listingId,
          buyer_name: form.buyerName.trim(),
          buyer_email: form.buyerEmail.trim(),
          buyer_phone: form.buyerPhone.trim()
            ? formatPhoneHint(form.buyerPhone)
            : undefined,
          requested_times: requestedTimes.length > 0 ? requestedTimes : undefined,
          message: form.message.trim() || undefined,
          source_url: window.location.href,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }

      if (res.ok) {
        setStatus('success')
        return
      }

      setStatus('error')
      setErrorMessage(
        data.error === 'Too many requests'
          ? 'Too many requests — please wait a minute and try again.'
          : data.error === 'Listing not found'
            ? 'That property is no longer available. Please choose another listing.'
            : 'Something went wrong. Please try again or contact the agent directly.',
      )
    } catch {
      setStatus('error')
      setErrorMessage('Network error. Please check your connection and try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-[#BFE7FF] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F0F7FF] text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-bold text-[#0D2B55]">Request submitted</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Check your email for confirmation. {agent?.displayName ?? orgName} will reach out
          shortly to confirm your showing time.
        </p>
      </div>
    )
  }

  const agentInitials = (agent?.displayName ?? orgName)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input
        type="text"
        name="website"
        value={form.honeypot}
        onChange={(e) => setForm((p) => ({ ...p, honeypot: e.target.value }))}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {agent && (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
          {agent.photoUrl ? (
            <img
              src={agent.photoUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-[#F0F7FF]"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0D2B55] text-sm font-bold text-white">
              {agentInitials}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#F07018]">
              Your agent
            </p>
            <p className="text-lg font-bold text-[#0D2B55]">{agent.displayName}</p>
            <p className="text-sm text-slate-500">{orgName}</p>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="property" className="mb-1.5 block text-sm font-medium text-[#0D2B55]">
          Property address *
        </label>
        <input
          id="property"
          type="text"
          autoComplete="off"
          value={form.propertyQuery}
          onChange={(e) => {
            const value = e.target.value
            setForm((p) => ({
              ...p,
              propertyQuery: value,
              listingId: listings.some((l) => l.label === value) ? p.listingId : '',
            }))
          }}
          placeholder="Search listings — e.g. Austin, Main St"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
        />
        {fieldErrors.property && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors.property}</p>
        )}
        {filteredListings.length > 0 && form.propertyQuery.trim() && (
          <ul
            className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm"
            role="listbox"
          >
            {filteredListings.map((listing) => (
              <li key={listing.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={form.listingId === listing.id}
                  onClick={() => selectListing(listing)}
                  className={`w-full px-3 py-2.5 text-left text-sm hover:bg-[#F0F7FF] ${
                    form.listingId === listing.id ? 'bg-[#F0F7FF] font-medium text-[#0D2B55]' : 'text-slate-700'
                  }`}
                >
                  {listing.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {listings.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">
            No active listings right now. Contact {orgName} directly.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="buyerName" className="mb-1.5 block text-sm font-medium text-[#0D2B55]">
            Your name *
          </label>
          <input
            id="buyerName"
            type="text"
            required
            value={form.buyerName}
            onChange={(e) => setForm((p) => ({ ...p, buyerName: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
          />
          {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
        </div>
        <div>
          <label htmlFor="buyerEmail" className="mb-1.5 block text-sm font-medium text-[#0D2B55]">
            Email *
          </label>
          <input
            id="buyerEmail"
            type="email"
            required
            value={form.buyerEmail}
            onChange={(e) => setForm((p) => ({ ...p, buyerEmail: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
          />
          {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="buyerPhone" className="mb-1.5 block text-sm font-medium text-[#0D2B55]">
          Phone
        </label>
        <input
          id="buyerPhone"
          type="tel"
          value={form.buyerPhone}
          onChange={(e) => setForm((p) => ({ ...p, buyerPhone: e.target.value }))}
          placeholder="(555) 867-5309"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
        />
        {fieldErrors.phone && <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>}
      </div>

      <fieldset className="border-t border-slate-200 pt-4">
        <legend className="text-sm font-medium text-[#0D2B55]">
          Preferred showing times (optional)
        </legend>
        <div className="mt-3 space-y-3">
          {(['First choice', 'Second choice', 'Third choice'] as const).map((label, idx) => {
            const key =
              idx === 0 ? 'requestedTime1' : idx === 1 ? 'requestedTime2' : 'requestedTime3'
            return (
              <div key={label}>
                <label className="mb-1 block text-xs text-slate-500">{label}</label>
                <input
                  type="datetime-local"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
                />
              </div>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-[#0D2B55]">
          Message
        </label>
        <textarea
          id="message"
          rows={3}
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          placeholder="Tell us what you are looking for..."
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#F07018] focus:outline-none focus:ring-2 focus:ring-[#F07018]/25"
        />
      </div>

      {status === 'error' && errorMessage && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || listings.length === 0}
        className="w-full rounded-lg bg-[#F07018] py-3 text-sm font-bold text-white transition hover:bg-[#d96210] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Submitting…' : 'Request a showing'}
      </button>
    </form>
  )
}
