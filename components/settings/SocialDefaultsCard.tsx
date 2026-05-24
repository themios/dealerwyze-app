'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2, Hash, MessageSquareText, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SocialDefaults {
  social_hashtags: string
  social_tagline:  string
  social_footer:   string
}

export default function SocialDefaultsCard({ isRe = false }: { isRe?: boolean }) {
  const [form, setForm]       = useState<SocialDefaults>({
    social_hashtags: '',
    social_tagline:  '',
    social_footer:   '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/social-defaults')
      .then(r => r.ok ? r.json() : null)
      .then((d: SocialDefaults | null) => {
        if (d) setForm(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/settings/social-defaults', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Save failed')
      }
      const updated = await res.json() as SocialDefaults
      setForm(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Live preview of what the appended block will look like
  const previewLines: string[] = []
  if (form.social_tagline.trim())  previewLines.push(form.social_tagline.trim())
  if (form.social_footer.trim())   previewLines.push(form.social_footer.trim())
  if (form.social_hashtags.trim()) previewLines.push(form.social_hashtags.trim())
  const preview = previewLines.join('\n')

  if (loading) {
    return (
      <div className="py-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold">Post defaults</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
          These are appended to every caption when you post to Facebook or Instagram — you can
          still edit the caption before posting. Leave any field blank to skip it.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-4 max-w-lg">
        {/* Tagline */}
        <div className="space-y-1.5">
          <Label htmlFor="social-tagline" className="flex items-center gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
            Tagline
          </Label>
          <Input
            id="social-tagline"
            value={form.social_tagline}
            onChange={e => setForm(prev => ({ ...prev, social_tagline: e.target.value }))}
            placeholder="e.g. Serving Ventura & LA County since 1998"
            maxLength={200}
          />
          <p className="text-[11px] text-muted-foreground">
            One-line brand phrase shown right after the {isRe ? 'listing description' : 'vehicle description'}.
          </p>
        </div>

        {/* Footer */}
        <div className="space-y-1.5">
          <Label htmlFor="social-footer" className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Footer / address
          </Label>
          <textarea
            id="social-footer"
            value={form.social_footer}
            onChange={e => setForm(prev => ({ ...prev, social_footer: e.target.value }))}
            placeholder={'e.g. 📍 123 Main St, Ventura CA 93001\n⏰ Mon–Sat 9am–6pm'}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-y"
          />
          <div className={cn(
            'text-right text-[11px] tabular-nums',
            form.social_footer.length > 450 ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {form.social_footer.length} / 500
          </div>
        </div>

        {/* Hashtags */}
        <div className="space-y-1.5">
          <Label htmlFor="social-hashtags" className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            Default hashtags
          </Label>
          <textarea
            id="social-hashtags"
            value={form.social_hashtags}
            onChange={e => setForm(prev => ({ ...prev, social_hashtags: e.target.value }))}
            placeholder={isRe ? '#realestate #realtywyze #homesforsale #newlisting' : '#usedcars #dealerwyze #carsofinstagram #ventura'}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {form.social_hashtags.trim()
                ? `${form.social_hashtags.trim().split(/\s+/).filter(w => w.startsWith('#')).length} hashtags`
                : 'Appended last in every post caption'}
            </p>
            <span className={cn(
              'text-[11px] tabular-nums',
              form.social_hashtags.length > 450 ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {form.social_hashtags.length} / 500
            </span>
          </div>
        </div>

        {/* Live preview */}
        {preview && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Caption preview — appended block
            </p>
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
          </div>
        )}
      </div>

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
        ) : saved ? (
          <><Check className="h-3.5 w-3.5 mr-1.5" />Saved!</>
        ) : (
          'Save defaults'
        )}
      </Button>
    </div>
  )
}
