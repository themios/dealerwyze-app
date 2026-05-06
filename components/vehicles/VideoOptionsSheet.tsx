'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { Video, X, Loader2, Check, GripVertical, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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

const SCRIPT_MAX = 1500

export default function VideoOptionsSheet({
  vehicleId,
  vehicleLabel,
  availablePhotos,
  onClose,
  onRenderStarted,
}: VideoOptionsSheetProps) {
  const [templates, setTemplates]       = useState<VideoTemplate[]>([])
  const [accounts, setAccounts]         = useState<SocialAccount[]>([])
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(() =>
    availablePhotos.slice(0, Math.min(6, availablePhotos.length)),
  )
  const [templateId, setTemplateId]       = useState<string>('')
  const [voice, setVoice]                 = useState('en-US-Neural2-D')
  const [platforms, setPlatforms]         = useState<string[]>([])
  const [autoPost, setAutoPost]           = useState(false)
  const [scriptMode, setScriptMode]       = useState<'auto' | 'custom'>('auto')
  const [customScript, setCustomScript]   = useState('')
  const [scriptLoading, setScriptLoading] = useState(false)
  const [isSubmitting, setIsSubmitting]   = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [submitted, setSubmitted]         = useState(false)
  const [dragOverUrl, setDragOverUrl]     = useState<string | null>(null)

  const availablePhotosKey = availablePhotos.join('|')
  useEffect(() => {
    setSelectedPhotos(prev => {
      const stillThere = prev.filter(u => availablePhotos.includes(u))
      if (stillThere.length > 0) return stillThere
      return availablePhotos.slice(0, Math.min(6, availablePhotos.length))
    })
  }, [availablePhotosKey, availablePhotos])

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
        setPlatforms((data.accounts ?? []).map(a => a.platform))
      }
    }
    load()
  }, [])

  function togglePhoto(url: string) {
    setSelectedPhotos(prev =>
      prev.includes(url) ? prev.filter(p => p !== url) : prev.length < 8 ? [...prev, url] : prev,
    )
  }

  function reorderSelected(sourceUrl: string, targetUrl: string) {
    if (sourceUrl === targetUrl) return
    setSelectedPhotos(prev => {
      const si = prev.indexOf(sourceUrl)
      const ti = prev.indexOf(targetUrl)
      if (si < 0 || ti < 0) return prev
      const next = [...prev]
      const [item] = next.splice(si, 1)
      next.splice(ti, 0, item)
      return next
    })
    setDragOverUrl(null)
  }

  function togglePlatform(platform: string) {
    setPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  async function loadAiDraft() {
    setScriptLoading(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/narration-script`)
      if (res.ok) {
        const data = await res.json() as { script: string }
        setCustomScript(data.script ?? '')
      }
    } catch {
      // user can type manually
    } finally {
      setScriptLoading(false)
    }
  }

  async function handleSubmit() {
    if (selectedPhotos.length === 0) {
      setError('Select at least one photo')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const trimmedScript = customScript.trim()
      if (scriptMode === 'custom' && trimmedScript.length > SCRIPT_MAX) {
        setError(`Script must be ${SCRIPT_MAX.toLocaleString()} characters or fewer`)
        setIsSubmitting(false)
        return
      }

      const res = await fetch(`/api/vehicles/${vehicleId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId || undefined,
          photoUrls:  selectedPhotos,
          voice,
          autoPost:   autoPost && platforms.length > 0,
          platforms,
          script:     scriptMode === 'custom' && trimmedScript ? trimmedScript : undefined,
        }),
      })
      if (!res.ok) {
        let errorMsg = 'Failed to start render'
        try {
          const errData = await res.json() as { error?: string }
          errorMsg = errData.error ?? errorMsg
        } catch {
          if (res.status === 504) errorMsg = 'This is taking longer than expected. Please try again.'
          else if (res.status === 429) errorMsg = 'Render quota reached. Try again later.'
        }
        throw new Error(errorMsg)
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

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <p className="font-semibold text-lg mb-1">Your video is being created</p>
          <p className="text-sm text-muted-foreground mb-6">
            This takes about 45 seconds. The video will appear on this vehicle page when it is ready.
          </p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    )
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

        <div className="p-4 space-y-5">
          <p className="text-sm text-muted-foreground">{vehicleLabel}</p>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Photo selector */}
          {availablePhotos.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-sm font-semibold">
                  Photos{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({selectedPhotos.length}/8 selected)
                  </span>
                </p>
                {selectedPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPhotos([])}
                    className="text-xs text-muted-foreground underline shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Same images as your website listing gallery — pick up to eight clips. Tap the grid to add or remove; drag the
                selected row to order them in the video.
              </p>

              {selectedPhotos.length > 0 && (
                <div className="mb-3 rounded-lg border border-border bg-muted/30 p-2">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2 px-0.5">Video order — drag to reorder</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPhotos.map(url => (
                      <div
                        key={url}
                        onDragOver={e => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          setDragOverUrl(url)
                        }}
                        onDragLeave={() => setDragOverUrl(u => (u === url ? null : u))}
                        onDrop={e => {
                          e.preventDefault()
                          const src = e.dataTransfer.getData('text/plain')
                          reorderSelected(src, url)
                        }}
                        className={cn(
                          'relative h-16 w-16 shrink-0 rounded-md overflow-hidden border-2 border-transparent',
                          dragOverUrl === url && 'border-primary',
                        )}
                      >
                        <div
                          draggable
                          title="Drag to reorder"
                          aria-label="Drag to reorder clip order"
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', url)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => setDragOverUrl(null)}
                          className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-black/40 px-0.5 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="h-4 w-4 text-white" aria-hidden />
                        </div>
                        <Image
                          src={url}
                          alt="Selected for video"
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="64px"
                        />
                        <div className="absolute bottom-0 right-0 min-w-[1rem] h-4 px-0.5 bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center tabular-nums">
                          {selectedPhotos.indexOf(url) + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {availablePhotos.map(url => {
                  const position = selectedPhotos.indexOf(url)
                  const isSelected = position >= 0
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => togglePhoto(url)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <Image src={url} alt="" fill unoptimized className="object-cover" sizes="25vw" />
                      {isSelected && (
                        <div className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-[11px] font-semibold text-primary-foreground tabular-nums">
                            {position + 1}
                          </span>
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

          {/* Narration Script */}
          <div>
            <p className="text-sm font-semibold mb-2">Narration Script</p>
            <div className="flex rounded-lg border border-border overflow-hidden mb-3">
              <button
                type="button"
                onClick={() => setScriptMode('auto')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  scriptMode === 'auto'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Auto-generate
              </button>
              <button
                type="button"
                onClick={() => {
                  setScriptMode('custom')
                  if (!customScript) void loadAiDraft()
                }}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  scriptMode === 'custom'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Write my own
              </button>
            </div>

            {scriptMode === 'auto' && (
              <p className="text-xs text-muted-foreground">
                The script will be automatically generated from the vehicle details, pricing, and dealer info.
              </p>
            )}

            {scriptMode === 'custom' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Write exactly what the narrator will say.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadAiDraft()}
                    disabled={scriptLoading}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {scriptLoading
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Wand2 className="h-3 w-3" />
                    }
                    {scriptLoading ? 'Loading…' : 'Load AI draft'}
                  </button>
                </div>
                <textarea
                  value={customScript}
                  onChange={e => setCustomScript(e.target.value)}
                  placeholder="e.g. Just arrived — a 2022 Toyota Camry with only 28,000 miles, priced at $21,995. Clean title, one owner, fully serviced. Call us today!"
                  rows={5}
                  maxLength={SCRIPT_MAX}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                />
                <div className={`text-right text-[11px] tabular-nums ${
                  customScript.length > SCRIPT_MAX * 0.9 ? 'text-destructive' : 'text-muted-foreground'
                }`}>
                  {customScript.length} / {SCRIPT_MAX.toLocaleString()}
                </div>
              </div>
            )}
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
      </div>
    </div>
  )
}
