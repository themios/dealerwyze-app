'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { X, Loader2, Check, GripVertical, ExternalLink, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SocialAccount {
  id: string
  platform: string
  account_label: string
}

interface SocialDefaults {
  social_hashtags: string
  social_tagline:  string
  social_footer:   string
}

function buildInitialCaption(vehicleLabel: string, defaults: SocialDefaults): string {
  const lines: string[] = [`Just listed: ${vehicleLabel}`, '']
  if (defaults.social_tagline.trim())  lines.push(defaults.social_tagline.trim(), '')
  if (defaults.social_footer.trim())   lines.push(defaults.social_footer.trim(), '')
  if (defaults.social_hashtags.trim()) lines.push(defaults.social_hashtags.trim())
  else                                  lines.push('#usedcars #dealerwyze #carsofinstagram')
  return lines.join('\n').trimEnd()
}

interface CarouselSheetProps {
  vehicleId: string
  vehicleLabel: string
  availablePhotos: string[]
  onClose: () => void
}

const MAX_PHOTOS = 9   // API appends end card → 10 slides total (Meta limit)
const CAPTION_MAX = 2200

export default function CarouselSheet({
  vehicleId,
  vehicleLabel,
  availablePhotos,
  onClose,
}: CarouselSheetProps) {
  const [accounts, setAccounts]             = useState<SocialAccount[]>([])
  const [defaults, setDefaults]             = useState<SocialDefaults | null>(null)
  const [captionInitialised, setCaptionInitialised] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(() =>
    availablePhotos.slice(0, Math.min(9, availablePhotos.length)),
  )
  const [caption, setCaption]               = useState(
    `Just listed: ${vehicleLabel}\n\n📞 Call or text us today\n\n#usedcars #dealerwyze #carsofinstagram`,
  )
  const [dragOverUrl, setDragOverUrl]     = useState<string | null>(null)
  const [posting, setPosting]             = useState(false)
  const [posted, setPosted]               = useState(false)
  const [postUrl, setPostUrl]             = useState('')
  const [slideCount, setSlideCount]       = useState(0)
  const [error, setError]                 = useState<string | null>(null)

  const igAccounts = accounts.filter(a => a.platform === 'instagram')

  useEffect(() => {
    fetch('/api/social/accounts')
      .then(r => r.ok ? r.json() : { accounts: [], defaults: null })
      .then((d: { accounts: SocialAccount[]; defaults?: SocialDefaults }) => {
        setAccounts(d.accounts ?? [])
        if (d.defaults) setDefaults(d.defaults)
      })
      .catch(() => {})
  }, [])

  // Rebuild caption once defaults arrive
  useEffect(() => {
    if (!captionInitialised && defaults) {
      setCaption(buildInitialCaption(vehicleLabel, defaults))
      setCaptionInitialised(true)
    }
  }, [defaults, vehicleLabel, captionInitialised])

  // Keep selection valid when availablePhotos changes
  const photosKey = availablePhotos.join('|')
  useEffect(() => {
    setSelectedPhotos(prev => {
      const still = prev.filter(u => availablePhotos.includes(u))
      return still.length ? still : availablePhotos.slice(0, Math.min(MAX_PHOTOS, availablePhotos.length))
    })
  }, [photosKey, availablePhotos])

  function togglePhoto(url: string) {
    setSelectedPhotos(prev =>
      prev.includes(url)
        ? prev.filter(p => p !== url)
        : prev.length < MAX_PHOTOS
          ? [...prev, url]
          : prev,
    )
  }

  function reorderSelected(src: string, tgt: string) {
    if (src === tgt) return
    setSelectedPhotos(prev => {
      const si = prev.indexOf(src)
      const ti = prev.indexOf(tgt)
      if (si < 0 || ti < 0) return prev
      const next = [...prev]
      const [item] = next.splice(si, 1)
      next.splice(ti, 0, item)
      return next
    })
    setDragOverUrl(null)
  }

  async function handlePost() {
    if (selectedPhotos.length < 2) { setError('Select at least 2 photos'); return }
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/carousel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrls: selectedPhotos,
          caption:   caption.trim() || undefined,
        }),
      })
      if (!res.ok) {
        let msg = 'Failed to post carousel'
        try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch {}
        throw new Error(msg)
      }
      const data = await res.json() as { postUrl: string; slideCount: number }
      setPostUrl(data.postUrl)
      setSlideCount(data.slideCount)
      setPosted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPosting(false)
    }
  }

  // ── Success screen
  if (posted) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <p className="font-semibold text-lg mb-1">Carousel posted!</p>
          <p className="text-sm text-muted-foreground mb-4">
            Your {slideCount}-slide branded carousel is live on Instagram.
          </p>
          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6"
            >
              View on Instagram <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button onClick={onClose} className="w-full mt-4">Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-pink-500" />
            <h2 className="font-semibold">Post Instagram Carousel</h2>
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

          {/* Instagram account indicator */}
          {igAccounts.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-pink-500" />
              <span>Posting to <strong className="text-foreground">{igAccounts[0].account_label}</strong></span>
            </div>
          ) : (
            <div className="text-xs text-destructive/80 bg-destructive/10 rounded-lg p-3">
              No Instagram account connected. Go to <strong>Settings → Social Accounts</strong> to connect one.
            </div>
          )}

          {/* Photo selector */}
          {availablePhotos.length > 0 ? (
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-sm font-semibold">
                  Photos{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({selectedPhotos.length}/{MAX_PHOTOS} selected + 1 branded end card)
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
                Pick 2–{MAX_PHOTOS} photos. Slide 1 gets a price overlay; a branded end card is always added last.
              </p>

              {/* Reorder row */}
              {selectedPhotos.length > 0 && (
                <div className="mb-3 rounded-lg border border-border bg-muted/30 p-2">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2 px-0.5">
                    Slide order — drag to reorder
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPhotos.map(url => (
                      <div
                        key={url}
                        onDragOver={e => { e.preventDefault(); setDragOverUrl(url) }}
                        onDragLeave={() => setDragOverUrl(u => (u === url ? null : u))}
                        onDrop={e => { e.preventDefault(); reorderSelected(e.dataTransfer.getData('text/plain'), url) }}
                        className={cn(
                          'relative h-16 w-16 shrink-0 rounded-md overflow-hidden border-2 border-transparent',
                          dragOverUrl === url && 'border-primary',
                        )}
                      >
                        <div
                          draggable
                          aria-label="Drag to reorder"
                          onDragStart={e => { e.dataTransfer.setData('text/plain', url); e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => setDragOverUrl(null)}
                          className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-black/40 px-0.5 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="h-4 w-4 text-white" aria-hidden />
                        </div>
                        <Image src={url} alt="Selected" fill unoptimized className="object-cover" sizes="64px" />
                        <div className="absolute bottom-0 right-0 min-w-[1rem] h-4 px-0.5 bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center tabular-nums">
                          {selectedPhotos.indexOf(url) + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo grid */}
              <div className="grid grid-cols-4 gap-2">
                {availablePhotos.map(url => {
                  const position   = selectedPhotos.indexOf(url)
                  const isSelected = position >= 0
                  const atMax      = selectedPhotos.length >= MAX_PHOTOS && !isSelected
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => togglePhoto(url)}
                      disabled={atMax}
                      className={cn(
                        'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                        isSelected ? 'border-primary' : 'border-transparent',
                        atMax && 'opacity-40 cursor-not-allowed',
                      )}
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
          ) : (
            <p className="text-sm text-muted-foreground">Upload photos to this vehicle to create a carousel.</p>
          )}

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">Caption</p>
              {defaults && (
                <button
                  type="button"
                  onClick={() => setCaption(buildInitialCaption(vehicleLabel, defaults))}
                  className="text-xs text-muted-foreground underline"
                >
                  Reset to defaults
                </button>
              )}
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={5}
              maxLength={CAPTION_MAX}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
            <div className={cn(
              'text-right text-[11px] tabular-nums mt-1',
              caption.length > CAPTION_MAX * 0.9 ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {caption.length} / {CAPTION_MAX.toLocaleString()}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handlePost}
            disabled={posting || selectedPhotos.length < 2 || igAccounts.length === 0}
            className="w-full"
          >
            {posting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Posting carousel…</>
              : `Post Carousel (${selectedPhotos.length + 1} slides)`
            }
          </Button>

          {selectedPhotos.length === 1 && (
            <p className="text-xs text-center text-muted-foreground -mt-3">Select at least 2 photos</p>
          )}
        </div>
      </div>
    </div>
  )
}
