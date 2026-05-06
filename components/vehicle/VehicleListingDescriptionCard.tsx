'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Copy, Check, Sparkles } from 'lucide-react'

interface Props {
  vehicleId: string
}

/** Splits AI output into clean bullet strings, stripping leading • / - / * markers. */
function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim().replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean)
}

export default function VehicleListingDescriptionCard({ vehicleId }: Props) {
  const [description, setDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/ai-description`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setDescription(json.description)
    } catch {
      setError('Generation failed — try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!description) return
    await navigator.clipboard.writeText(description)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <p className="text-sm font-medium">AI Listing Description</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Short blurb for Facebook Marketplace, Craigslist, or any external listing.
            Not saved — copy it once generated.
          </p>
        </div>
        <Button
          type="button"
          variant={description ? 'outline' : 'secondary'}
          size="sm"
          onClick={generate}
          disabled={loading}
          className="shrink-0 h-8 text-xs"
        >
          {loading ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Generating…</>
          ) : description ? (
            'Regenerate'
          ) : (
            'Generate'
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Loading placeholder */}
      {loading && !description && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-4/5" />
          <div className="h-3 bg-muted rounded w-3/5" />
        </div>
      )}

      {/* Result */}
      {description && !loading && (
        <div className="space-y-2">
          <ul className="rounded-md border bg-muted/30 divide-y divide-border">
            {parseBullets(description).map((line, i) => (
              <li key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="text-sm text-foreground leading-snug">{line}</span>
              </li>
            ))}
          </ul>
          {/* Full-width copy button — 44px touch target for mobile use on the lot */}
          <button
            onClick={copy}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-md border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={copied ? 'Copied to clipboard' : 'Copy description to clipboard'}
          >
            {copied
              ? <><Check className="h-4 w-4 text-green-500" /><span className="text-green-600">Copied!</span></>
              : <><Copy className="h-4 w-4" />Copy to clipboard</>}
          </button>
        </div>
      )}
    </div>
  )
}
