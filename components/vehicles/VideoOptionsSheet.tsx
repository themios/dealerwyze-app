'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { Video, X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VOICE_OPTIONS } from '@/lib/remotion/selectDefaults'

interface VideoTemplate {
  id: string
  name: string
  description: string | null
  composition_id: string
  aspect_ratio: string
  duration_seconds: number
  best_for: string[]
}

interface SocialAccount {
  id: string
  platform: string
  account_label: string
}

interface VideoOptionsSheetProps {
  vehicleId: string
  vehicleLabel: string
  availablePhotos: string[]
  onClose: () => void
  onRenderStarted: (renderId: string) => void
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook:  'Facebook',
  instagram: 'Instagram',
  tiktok:    'TikTok',
  youtube:   'YouTube',
}

const ASPECT_LABELS: Record<string, string> = {
  '16:9': 'Landscape (16:9)',
  '9:16': 'Portrait (9:16)',
}

export default function VideoOptionsSheet({
  vehicleId,
  vehicleLabel,
  availablePhotos,
  onClose,
  onRenderStarted,
}: VideoOptionsSheetProps) {
  const [templates, setTemplates]       = useState<VideoTemplate[]>([])
  const [accounts, setAccounts]         = useState<SocialAccount[]>([])
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(availablePhotos.slice(0, 6))
  const [templateId, setTemplateId]     = useState<string>('')
  const [voice, setVoice]               = useState('en-US-Neural2-D')
  const [platforms, setPlatforms]       = useState<string[]>([])
  const [autoPost, setAutoPost]         = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [submitted, setSubmitted]       = useState(false)

  useEffect(() => {
    async function load() {
      const [tplRes, accRes] = await Promise.all([
        fetch('/api/video-templates'),
        fetch('/api/social/accounts'),
      ])
      if (tplRes.ok) {
        const data = await tplRes.json() as { templates: VideoTemplate[] }
        setTemplates(data.templates ?? [])
        if (data.templates.length > 0) setTemplateId(data.templates[0].id)
      }
      if (accRes.ok) {
        const data = await accRes.json() as { accounts: SocialAccount[] }
        setAccounts(data.accounts ?? [])
        // Pre-check all connected platforms
        setPlatforms((data.accounts ?? []).map(a => a.platform))
      }
    }
    load()
  }, [])

  function togglePhoto(url: string) {
    setSelectedPhotos(prev =>
      prev.includes(url)
        ? prev.filter(p => p !== url)
        : prev.length < 8 ? [...prev, url] : prev
    )
  }

  function togglePlatform(platform: string) {
    setPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  async function handleSubmit() {
    if (selectedPhotos.length === 0) {
      setError('Select at least one photo')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId || undefined,
          photoUrls:  selectedPhotos,
          voice,
          autoPost:   autoPost && platforms.length > 0,
          platforms:  platforms,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to start render')
      }
      const data = await res.json() as { renderId: string }
      setSubmitted(true)
      onRenderStarted(data.renderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Create Video</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-semibold text-lg mb-1">Your video is being created</p>
            <p className="text-sm text-muted-foreground mb-6">
              This takes about 45 seconds. The video will appear on this vehicle page when it is ready.
            </p>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <p className="text-sm text-muted-foreground">{vehicleLabel}</p>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
            )}

            {/* Photo selector */}
            {availablePhotos.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">
                  Photos <span className="text-xs font-normal text-muted-foreground">({selectedPhotos.length}/8 selected)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {availablePhotos.map((url, i) => {
                    const isSelected = selectedPhotos.includes(url)
                    return (
                      <button
                        key={i}
                        onClick={() => togglePhoto(url)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected ? 'border-primary' : 'border-transparent'
                        }`}
                      >
                        <Image src={url} alt={`Photo ${i + 1}`} fill unoptimized className="object-cover" sizes="25vw" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Template selector */}
            {templates.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Template</p>
                <div className="space-y-2">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => setTemplateId(tpl.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                        templateId === tpl.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ASPECT_LABELS[tpl.aspect_ratio] ?? tpl.aspect_ratio} - {tpl.duration_seconds}s
                        </p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                        )}
                      </div>
                      {templateId === tpl.id && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Voice selector */}
            <div>
              <p className="text-sm font-semibold mb-2">Narration Voice</p>
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

            {/* Platform checkboxes */}
            {accounts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-1">Auto-post to</p>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPost}
                    onChange={e => setAutoPost(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Post automatically when video is ready</span>
                </label>
                {autoPost && (
                  <div className="space-y-2 pl-1">
                    {accounts.map(acc => (
                      <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={platforms.includes(acc.platform)}
                          onChange={() => togglePlatform(acc.platform)}
                          className="rounded"
                        />
                        <span className="text-sm">
                          {PLATFORM_LABELS[acc.platform] ?? acc.platform}
                          <span className="text-xs text-muted-foreground ml-1">({acc.account_label})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {accounts.length === 0 && (
              <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
                Connect social accounts in Settings to enable auto-posting.
              </div>
            )}

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedPhotos.length === 0}
              className="w-full"
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating video...</>
                : 'Create Video'
              }
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
