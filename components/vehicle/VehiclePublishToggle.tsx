'use client'

import { useState } from 'react'
import { Globe, Copy, Check } from 'lucide-react'

interface Props {
  vehicleId: string
  orgSlug: string
  initialPublished: boolean
  initialSlug: string | null
}

export default function VehiclePublishToggle({ vehicleId, orgSlug, initialPublished, initialSlug }: Props) {
  const [published, setPublished] = useState(initialPublished)
  const [publicSlug, setPublicSlug] = useState<string | null>(initialSlug)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl = publicSlug
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://dealerwyze.com'}/${orgSlug}/inventory/${publicSlug}`
    : null

  const toggle = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !published }),
      })
      if (res.ok) {
        const data = await res.json()
        setPublished(p => !p)
        if (data.public_slug) setPublicSlug(data.public_slug)
      }
    } finally {
      setLoading(false)
    }
  }

  const copyUrl = async () => {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Show on public website</span>
        </div>

        {/* Toggle */}
        <button
          onClick={toggle}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
            published ? 'bg-blue-600' : 'bg-gray-300'
          }`}
          aria-label={published ? 'Unpublish vehicle' : 'Publish vehicle'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              published ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {published && publicUrl && (
        <div className="flex items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline truncate flex-1"
          >
            {publicUrl}
          </a>
          <button
            onClick={copyUrl}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            title="Copy link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {published && (
        <p className="text-xs text-gray-500">
          Customers can find and contact you about this vehicle online.
        </p>
      )}
    </div>
  )
}
