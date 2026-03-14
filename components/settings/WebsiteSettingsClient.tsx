'use client'

import { useState } from 'react'
import { Globe, Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  slug: string
  initialEnabled: boolean
  initialTagline: string
  initialDomain: string
}

export default function WebsiteSettingsClient({ slug, initialEnabled, initialTagline, initialDomain }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [tagline, setTagline] = useState(initialTagline)
  const [domain, setDomain] = useState(initialDomain)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl = `https://dealerwyze.com/${slug}/inventory`

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings/website', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_inventory_enabled: enabled,
          website_tagline: tagline,
          custom_domain: domain || null,
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  const copyUrl = async () => {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Public inventory page</p>
            <p className="text-xs text-muted-foreground mt-0.5">Let customers browse and contact you from a public website.</p>
          </div>
          <button
            onClick={() => setEnabled(e => !e)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
              enabled ? 'bg-blue-600' : 'bg-gray-300'
            }`}
            aria-label={enabled ? 'Disable public inventory' : 'Enable public inventory'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate flex-1"
            >
              {publicUrl}
            </a>
            <button onClick={copyUrl} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy link">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Tagline */}
      <div className="space-y-1.5">
        <Label htmlFor="tagline">Dealer tagline</Label>
        <Input
          id="tagline"
          value={tagline}
          onChange={e => setTagline(e.target.value)}
          placeholder="e.g. Quality used cars in El Monte"
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">Shown below your dealership name on the public page.</p>
      </div>

      {/* Custom domain */}
      <div className="space-y-1.5">
        <Label htmlFor="domain">Custom domain <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="domain"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="e.g. inventory.apolloauto.com"
        />
        <p className="text-xs text-muted-foreground">Contact support to activate a custom domain after entering it here.</p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save settings'}
      </Button>
    </div>
  )
}
