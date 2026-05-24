'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVertical } from '@/hooks/useVertical'

interface Props {
  vehicleId: string
  isStale: boolean
  initialDescription: string | null
  initialEnrichment: string | null
  initialAnalyzedAt: string | null
}

function formatAnalyzedAt(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Los_Angeles',
  }).format(new Date(iso))
}

export default function VehicleOverviewSection({
  vehicleId,
  isStale,
  initialDescription,
  initialEnrichment,
  initialAnalyzedAt,
}: Props) {
  const [description, setDescription] = useState(initialDescription ?? '')
  const [enrichment, setEnrichment] = useState(initialEnrichment ?? '')
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(initialAnalyzedAt)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [reflowing, setReflowing] = useState(false)
  const { vertical } = useVertical()
  const isRe = vertical === 'real_estate'

  async function saveEdits() {
    setSaving(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_description: description.trim() || null,
          overview_enrichment_text: enrichment.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Save failed')
        return
      }
      toast.success('Overview saved')
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function runRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/reanalyze`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        description?: string
        analyzed_at?: string
      }

      if (res.ok && data.description != null && data.analyzed_at) {
        setDescription(data.description)
        setAnalyzedAt(data.analyzed_at)
        toast.success('Overview regenerated — review and edit before publishing')
        return
      }

      if (res.status === 429 && data.error) {
        toast.error(data.error)
        return
      }

      if (res.status === 402 && data.error) {
        toast.error(data.error)
        return
      }

      toast.error(data.error ?? 'Regeneration failed')
    } catch {
      toast.error('Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  async function runReflow() {
    if (!description.trim()) {
      toast.error('Add overview text first')
      return
    }
    setReflowing(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/overview/reflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: description }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; description?: string }

      if (res.ok && data.description) {
        setDescription(data.description)
        toast.success('Sections fixed — review facts, then Save')
        return
      }

      if (res.status === 402 && data.error) {
        toast.error(data.error)
        return
      }

      toast.error(data.error ?? 'Smart sections failed')
    } catch {
      toast.error('Smart sections failed')
    } finally {
      setReflowing(false)
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Public website overview
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isRe ? (
            <>
              Buyers see this on your listing site as short sections. AI can be wrong; edit every line. Put disclosure
              reports, inspection reports, or floor plans in{' '}
              <span className="font-medium text-foreground">Website documents</span> above (summarized for AI and shown
              on the listing). Private documents go in{' '}
              <span className="font-medium text-foreground">Private files</span> -- not used for the website. Or paste
              plain text below.
            </>
          ) : (
            <>
              Shoppers see this on your dealer site as short sections -- not a wall of text. AI can be wrong; edit every
              line. Put Carfax / Autocheck / KBB files in{' '}
              <span className="font-medium text-foreground">Website &amp; shopper documents</span> above (summarized for
              AI and shown on the listing). Private BOS and receipts go in{' '}
              <span className="font-medium text-foreground">Inventory (private)</span> -- not used for the website. Or
              paste plain text below.
            </>
          )}
        </p>
      </div>

      {isStale && (
        <p className="text-xs font-medium rounded-md bg-amber-500/15 text-amber-900 dark:text-amber-100 px-2 py-1.5">
          Shopper documents changed — regenerate if you want the overview to reflect new Carfax-style uploads.
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`overview-body-${vehicleId}`} className="text-xs font-medium text-foreground">
          Overview (public)
        </label>
        <textarea
          id={`overview-body-${vehicleId}`}
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={12}
          placeholder={isRe
            ? "Example format (blank line between sections):\n\n✨ Why it stands out\nCorner lot. Newly remodeled kitchen.\nOpen concept main floor.\n\n🏡 Property highlights\n3 bed / 2 bath. 1,850 sqft.\nAttached 2-car garage.\n\n📞 Next step\nSchedule a showing today."
            : "Example format (blank line between sections):\n\n✨ Why it stands out\nLow miles for the year.\nGreat commuter MPG.\n\n🛡️ History\nClean title. One owner in notes.\n\n📞 Next step\nCall today to schedule a test drive."
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed min-h-[200px]"
        />
        <p className="text-[10px] text-muted-foreground">
          After each section title, use <span className="font-medium text-foreground">one full sentence per line</span>
          . Messy paste? Use <span className="font-medium text-foreground">Smart sections</span> — AI reflows line breaks
          without changing facts (save after you verify).
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`overview-enrich-${vehicleId}`} className="text-xs font-medium text-foreground">
          Notes for AI only (not on website)
        </label>
        <textarea
          id={`overview-enrich-${vehicleId}`}
          value={enrichment}
          onChange={e => setEnrichment(e.target.value)}
          rows={5}
          placeholder={isRe
            ? "Paste disclosure text, inspection report bullets, or agent notes. Used when you click Regenerate. Buyers never see this field."
            : "Paste Carfax/Autocheck/KBB text, auction announcements, or inspection bullets. Used when you click Regenerate. Shoppers never see this field."
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={saveEdits}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save overview
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={runReflow}
          disabled={reflowing || regenerating || !description.trim()}
        >
          {reflowing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              Reflowing…
            </>
          ) : (
            'Smart sections (AI)'
          )}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={runRegenerate} disabled={regenerating || reflowing}>
          {regenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              Regenerating…
            </>
          ) : (
            'Regenerate with AI'
          )}
        </Button>
      </div>

      {analyzedAt && (
        <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
          Last AI run {formatAnalyzedAt(analyzedAt)}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground border-t pt-2">
        Only <span className="font-medium text-foreground">{isRe ? 'Website documents' : 'Website & shopper documents'}</span> are
        summarized for AI (rate limits apply). Private {isRe ? 'files' : 'inventory uploads'} are never sent to listing AI.
      </p>
    </div>
  )
}
