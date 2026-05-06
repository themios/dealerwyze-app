'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Globe, Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { getPublicAppBaseUrl } from '@/lib/dealer-public/site'

interface Props {
  vehicleId: string
  orgSlug: string
  initialPublished: boolean
  initialSlug: string | null
  /** When false, published vehicle VDPs return 404 until Settings → Website enables public inventory */
  dealerWebsiteLive?: boolean
}

export default function VehiclePublishToggle({
  vehicleId,
  orgSlug,
  initialPublished,
  initialSlug,
  dealerWebsiteLive = true,
}: Props) {
  const [published, setPublished] = useState(initialPublished)
  const [publicSlug, setPublicSlug] = useState<string | null>(initialSlug)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl = publicSlug
    ? `${getPublicAppBaseUrl()}/${orgSlug}/inventory/${publicSlug}`
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

  const switchId = `publish-toggle-${vehicleId}`

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Toggle row */}
      <div className="flex items-center justify-between gap-4 min-h-[44px]">
        <div className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <div>
            <Label htmlFor={switchId} className="text-sm font-medium cursor-pointer">
              Show on public website
            </Label>
            {!published && (
              <p className="text-xs text-muted-foreground">
                Hidden from shoppers
              </p>
            )}
          </div>
        </div>
        <Switch
          id={switchId}
          checked={published}
          onCheckedChange={toggle}
          disabled={loading}
          aria-label={published ? 'Unpublish vehicle from website' : 'Publish vehicle to website'}
        />
      </div>

      {/* Published state */}
      {published && (
        <div className="space-y-2">
          {publicUrl && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 min-h-[44px]">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline truncate flex-1 min-w-0"
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{publicUrl}</span>
              </a>
              <button
                onClick={copyUrl}
                className="shrink-0 flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={copied ? 'Copied!' : 'Copy link'}
                aria-label={copied ? 'Link copied' : 'Copy listing link'}
              >
                {copied
                  ? <Check className="h-4 w-4 text-green-500" />
                  : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Shoppers can find and contact you about this vehicle online.
          </p>

          {publicUrl && !dealerWebsiteLive && (
            <div className="flex gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden />
              <p>
                Your dealer inventory site is off — shoppers see a 404. Turn on{' '}
                <Link
                  href="/settings/website"
                  className="font-semibold underline underline-offset-2"
                >
                  public website / inventory
                </Link>
                {' '}in settings.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
