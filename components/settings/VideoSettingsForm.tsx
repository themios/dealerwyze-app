'use client'

import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VOICE_OPTIONS } from '@/lib/remotion/selectDefaults'

interface VideoTemplate {
  id: string
  name: string
  description: string | null
  aspect_ratio: string
  duration_seconds: number
}

interface VideoSettings {
  auto_post_on_listing: boolean
  default_voice: string
  favorite_template_ids: string[]
  include_price: boolean
  include_phone: boolean
  watermark_enabled: boolean
  render_quota_used: number
  render_quota_reset_at: string | null
  render_credits_purchased: number
}

interface Props {
  initialSettings: VideoSettings | null
  templates: VideoTemplate[]
  planLimit: number  // from server: 25 (growth) or 75 (pro)
}

export default function VideoSettingsForm({ initialSettings, templates, planLimit }: Props) {
  const [autoPost, setAutoPost]         = useState(initialSettings?.auto_post_on_listing ?? false)
  const [voice, setVoice]               = useState(initialSettings?.default_voice ?? 'en-US-Studio-Q')
  const [templateId, setTemplateId]     = useState(initialSettings?.favorite_template_ids?.[0] ?? '')
  const [includePrice, setIncludePrice] = useState(initialSettings?.include_price ?? true)
  const [includePhone, setIncludePhone] = useState(initialSettings?.include_phone ?? true)
  const [watermark, setWatermark]       = useState(initialSettings?.watermark_enabled ?? true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [buyingPack, setBuyingPack]     = useState(false)

  const quotaUsed      = initialSettings?.render_quota_used ?? 0
  const creditsPurchased = initialSettings?.render_credits_purchased ?? 0
  const effectiveLimit = planLimit + creditsPurchased

  async function handleBuyPack() {
    setBuyingPack(true)
    try {
      const res = await fetch('/api/stripe/video-pack', { method: 'POST' })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not start checkout')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBuyingPack(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    try {
      const res = await fetch('/api/settings/video', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_post_on_listing:  autoPost,
          default_voice:         voice,
          favorite_template_ids: templateId ? [templateId] : [],
          include_price:         includePrice,
          include_phone:         includePhone,
          watermark_enabled:     watermark,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Save failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Quota meter */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Monthly Videos</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resets on the 1st of each month</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBuyPack}
            disabled={buyingPack}
            className="shrink-0 text-xs"
          >
            {buyingPack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '+ Buy 25 more ($10)'}
          </Button>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${quotaUsed >= effectiveLimit ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, (quotaUsed / Math.max(effectiveLimit, 1)) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {quotaUsed} of {effectiveLimit} used
          </p>
          {creditsPurchased > 0 && (
            <p className="text-xs text-muted-foreground">
              {planLimit} included + {creditsPurchased} purchased
            </p>
          )}
        </div>
      </div>

      {/* Auto-post toggle */}
      <div className="border rounded-lg p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="font-medium text-sm">Auto-create video when vehicle is listed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically generates a video when a vehicle status changes to Available
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoPost}
            onClick={() => setAutoPost(!autoPost)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              autoPost ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                autoPost ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Default voice */}
      <div>
        <label className="text-sm font-medium block mb-1">Default Narration Voice</label>
        <select
          value={voice}
          onChange={e => setVoice(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {VOICE_OPTIONS.map(v => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Default template */}
      {templates.length > 0 && (
        <div>
          <label className="text-sm font-medium block mb-2">Default Template</label>
          <div className="space-y-2">
            {templates.map(tpl => (
              <label key={tpl.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="template"
                  value={tpl.id}
                  checked={templateId === tpl.id}
                  onChange={() => setTemplateId(tpl.id)}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.aspect_ratio} - {tpl.duration_seconds}s
                    {tpl.description ? ` - ${tpl.description}` : ''}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Display options */}
      <div>
        <p className="text-sm font-semibold mb-2">Video Display Options</p>
        <div className="space-y-2">
          {[
            { label: 'Show price in video',           value: includePrice, setter: setIncludePrice },
            { label: 'Show phone number in video',    value: includePhone, setter: setIncludePhone },
            { label: 'Show "Powered by DealerWyze"', value: watermark,    setter: setWatermark    },
          ].map(({ label, value, setter }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={value}
                onChange={e => setter(e.target.checked)}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
        ) : saved ? (
          <><Check className="h-4 w-4 mr-2" />Saved</>
        ) : 'Save Settings'}
      </Button>
    </div>
  )
}
