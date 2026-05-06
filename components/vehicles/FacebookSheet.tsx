'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { X, Loader2, Check, ExternalLink, Film, ImageIcon, GripVertical } from 'lucide-react'
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

interface FacebookSheetProps {
  vehicleId:        string
  vehicleLabel:     string
  availablePhotos:  string[]
  existingVideoUrl: string | null
  onClose:          () => void
}

type PostTab = 'photo' | 'reel'

const MAX_PHOTOS  = 10
const CAPTION_MAX = 63_206

function FbBadge({ size = 5 }: { size?: number }) {
  return (
    <span
      className={`h-${size} w-${size} rounded bg-[#1877F2] flex items-center justify-center text-white text-[11px] font-bold shrink-0`}
      aria-hidden
    >
      f
    </span>
  )
}

function buildInitialCaption(vehicleLabel: string, defaults: SocialDefaults): string {
  const lines: string[] = [`🚗 Just listed: ${vehicleLabel}`, '']
  if (defaults.social_tagline.trim())  lines.push(defaults.social_tagline.trim(), '')
  if (defaults.social_footer.trim())   lines.push(defaults.social_footer.trim(), '')
  if (defaults.social_hashtags.trim()) lines.push(defaults.social_hashtags.trim())
  return lines.join('\n').trimEnd()
}

export default function FacebookSheet({
  vehicleId,
  vehicleLabel,
  availablePhotos,
  existingVideoUrl,
  onClose,
}: FacebookSheetProps) {
  const [activeTab, setActiveTab]           = useState<PostTab>('photo')
  const [accounts, setAccounts]             = useState<SocialAccount[]>([])
  const [defaults, setDefaults]             = useState<SocialDefaults | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(
    () => availablePhotos.slice(0, Math.min(MAX_PHOTOS, availablePhotos.length)),
  )
  const [dragOverUrl, setDragOverUrl]       = useState<string | null>(null)
  const [caption, setCaption]               = useState(
    `🚗 Just listed: ${vehicleLabel}\n\n📞 Call or text us today\n\n#usedcars #dealerwyze`,
  )
  const [captionInitialised, setCaptionInitialised] = useState(false)
  const [posting, setPosting]               = useState(false)
  const [posted, setPosted]                 = useState(false)
  const [postUrl, setPostUrl]               = useState('')
  const [error, setError]                   = useState<string | null>(null)

  const fbAccounts = accounts.filter(a => a.platform === 'facebook')

  // Fetch accounts + defaults in one call
  useEffect(() => {
    fetch('/api/social/accounts')
      .then(r => r.ok ? r.json() : { accounts: [], defaults: null })
      .then((d: { accounts: SocialAccount[]; defaults?: SocialDefaults }) => {
        setAccounts(d.accounts ?? [])
        if (d.defaults) setDefaults(d.defaults)
      })
      .catch(() => {})
  }, [])

  // Initialise caption once defaults arrive (only once)
  useEffect(() => {
    if (!captionInitialised && defaults) {
      const built = buildInitialCaption(vehicleLabel, defaults)
      if (built.trim()) setCaption(built)
      setCaptionInitialised(true)
    }
  }, [defaults, vehicleLabel, captionInitialised])

  // Keep selection valid when photo list changes
  const photosKey = availablePhotos.join('|')
  useEffect(() => {
    setSelectedPhotos(prev => {
      const still = prev.filter(u => availablePhotos.includes(u))
      return still.length
        ? still
        : availablePhotos.slice(0, Math.min(MAX_PHOTOS, availablePhotos.length))
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
    setPosting(true)
    setError(null)
    try {
      const body =
        activeTab === 'photo'
          ? { type: 'photo' as const, photoUrls: selectedPhotos, caption: caption.trim() || undefined }
          : { type: 'reel'  as const, videoUrl: existingVideoUrl!, caption: caption.trim() || undefined }

      const res = await fetch(`/api/vehicles/${vehicleId}/facebook-post`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        let msg = 'Failed to post to Facebook'
        try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch {}
        throw new Error(msg)
      }
      const data = await res.json() as { postUrl: string }
      setPostUrl(data.postUrl)
      setPosted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPosting(false)
    }
  }

  const canPost =
    !posting &&
    fbAccounts.length > 0 &&
    (activeTab === 'photo' ? selectedPhotos.length > 0 : !!existingVideoUrl)

  // ── Success screen ──────────────────────────────────────────────────────────
  if (posted) {
    const typeLabel = activeTab === 'photo' ? 'Photo post' : 'Reel'
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <p className="font-semibold text-lg mb-1">{typeLabel} posted!</p>
          <p className="text-sm text-muted-foreground mb-4">
            Your listing is now live on your Facebook Page.
          </p>
          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6"
            >
              View on Facebook <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button onClick={onClose} className="w-full mt-4">Done</Button>
        </div>
      </div>
    )
  }

  // ── Main sheet ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <FbBadge />
            <h2 className="font-semibold">Post to Facebook</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <p className="text-sm text-muted-foreground">{vehicleLabel}</p>

          {/* Post type tabs */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab('photo')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all',
                activeTab === 'photo'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ImageIcon className="h-4 w-4" />
              Photo Post
            </button>
            <button
              onClick={() => setActiveTab('reel')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all',
                activeTab === 'reel'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Film className="h-4 w-4" />
              Reel
            </button>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Facebook account indicator */}
          {fbAccounts.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <FbBadge size={4} />
              <span>Posting to <strong className="text-foreground">{fbAccounts[0].account_label}</strong></span>
            </div>
          ) : (
            <div className="text-xs text-destructive/80 bg-destructive/10 rounded-lg p-3">
              No Facebook Page connected. Go to <strong>Settings → Social Accounts</strong> to connect one.
            </div>
          )}

          {/* ── Photo tab ─────────────────────────────────────────────────────── */}
          {activeTab === 'photo' && (
            <>
              {availablePhotos.length > 0 ? (
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold">
                      Photos{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({selectedPhotos.length}/{MAX_PHOTOS} selected — slide 1 gets price overlay)
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
                    Pick up to {MAX_PHOTOS} photos and drag to set the order.
                  </p>

                  {/* Reorder strip */}
                  {selectedPhotos.length > 0 && (
                    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-2">
                      <p className="text-[11px] font-medium text-muted-foreground mb-2 px-0.5">
                        Post order — drag to reorder
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
                              dragOverUrl === url && 'border-[#1877F2]',
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
                            <div className="absolute bottom-0 right-0 min-w-[1rem] h-4 px-0.5 bg-[#1877F2] text-[10px] font-semibold text-white flex items-center justify-center tabular-nums">
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
                            isSelected ? 'border-[#1877F2]' : 'border-transparent',
                            atMax && 'opacity-40 cursor-not-allowed',
                          )}
                        >
                          <Image src={url} alt="" fill unoptimized className="object-cover" sizes="25vw" />
                          {isSelected && (
                            <div className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 bg-[#1877F2] rounded-full flex items-center justify-center">
                              <span className="text-[11px] font-semibold text-white tabular-nums">
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
                <p className="text-sm text-muted-foreground">
                  Upload photos to this vehicle first.
                </p>
              )}
            </>
          )}

          {/* ── Reel tab ───────────────────────────────────────────────────────── */}
          {activeTab === 'reel' && (
            <div>
              {existingVideoUrl ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Film className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Rendered video</p>
                    <p className="text-xs text-muted-foreground truncate">{existingVideoUrl.split('/').pop()}</p>
                  </div>
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
                  <Film className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">No video generated yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the <strong>Generate Video</strong> button to create a video first, then post it as a Reel.
                  </p>
                </div>
              )}
            </div>
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
              rows={6}
              maxLength={CAPTION_MAX}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#1877F2]/30 resize-y"
            />
            <div className={cn(
              'text-right text-[11px] tabular-nums mt-1',
              caption.length > CAPTION_MAX * 0.9 ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {caption.length.toLocaleString()} / {CAPTION_MAX.toLocaleString()}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handlePost}
            disabled={!canPost}
            className="w-full bg-[#1877F2] hover:bg-[#166ee1] text-white"
          >
            {posting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Posting to Facebook…</>
            ) : activeTab === 'photo' ? (
              selectedPhotos.length > 1
                ? `Post ${selectedPhotos.length} Photos to Facebook`
                : 'Post Photo to Facebook'
            ) : (
              'Post Reel to Facebook'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
