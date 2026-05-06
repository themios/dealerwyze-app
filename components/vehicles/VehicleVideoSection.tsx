'use client'

import { useState, useEffect } from 'react'
import { Video, Download, X, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import VideoOptionsSheet from './VideoOptionsSheet'
import CarouselSheet from './CarouselSheet'
import FacebookSheet from './FacebookSheet'
import VideoPreviewPlayer from './VideoPreviewPlayer'
import RenderStatusBadge from './RenderStatusBadge'
import SocialPostStatus from './SocialPostStatus'

interface VehicleVideoSectionProps {
  vehicleId: string
  vehicleLabel: string
  /** Same URLs as the listing gallery (`vehicle_photos`), maintained by `VehiclePhotos` */
  listingPhotoUrls: string[]
  /** Listing gallery fetch in progress — video picker waits for fresh URLs when true */
  listingPhotosLoading?: boolean
}

interface RenderInfo {
  id: string
  status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'
  output_url: string | null
  error_message: string | null
  created_at: string
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function VehicleVideoSection({
  vehicleId,
  vehicleLabel,
  listingPhotoUrls,
  listingPhotosLoading = false,
}: VehicleVideoSectionProps) {
  const [showSheet, setShowSheet]                 = useState(false)
  const [showCarouselSheet, setShowCarouselSheet] = useState(false)
  const [showFacebookSheet, setShowFacebookSheet] = useState(false)
  const [render, setRender]           = useState<RenderInfo | null>(null)
  const [loading, setLoading]         = useState(true)
  const [cancelling, setCancelling]   = useState(false)
  const [socialLogRevision, setSocialLogRevision] = useState(0)
  const [postingSocial, setPostingSocial] = useState(false)

  useEffect(() => {
    let active = true
    async function loadRender() {
      try {
        const res = await fetch(`/api/vehicles/${vehicleId}/render`)
        if (!res.ok) return
        const data = await res.json() as { render: RenderInfo | null }
        if (active) setRender(data.render)
      } catch {
        // Ignore
      } finally {
        if (active) setLoading(false)
      }
    }
    loadRender()
    return () => { active = false }
  }, [vehicleId])

  function handleRenderStarted(renderId: string) {
    setRender({ id: renderId, status: 'queued', output_url: null, error_message: null, created_at: new Date().toISOString() })
    setShowSheet(false)
  }

  async function handleCancel() {
    if (!render || cancelling) return
    setCancelling(true)
    try {
      await fetch(`/api/vehicles/${vehicleId}/render`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', renderId: render.id }),
      })
      setRender(prev => prev ? { ...prev, status: 'cancelled' } : prev)
    } finally {
      setCancelling(false)
    }
  }

  function handleVideoReady(outputUrl: string) {
    setRender(prev => prev ? { ...prev, status: 'complete', output_url: outputUrl } : prev)
  }

  return (
    <>
      <div className="space-y-3 px-4 pb-4 pt-1 sm:px-5 border-t-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Video</p>
          <div className="flex items-center gap-2">
            {render?.status && (
              <RenderStatusBadge
                vehicleId={vehicleId}
                initialStatus={render.status}
                onReady={handleVideoReady}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFacebookSheet(true)}
              className="flex items-center gap-1.5"
              title="Post to Facebook"
            >
              <span className="h-3.5 w-3.5 rounded bg-[#1877F2] flex items-center justify-center text-white text-[9px] font-bold shrink-0">f</span>
              Facebook
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCarouselSheet(true)}
              disabled={listingPhotosLoading || listingPhotoUrls.length === 0}
              className="flex items-center gap-1.5"
              title="Post Instagram Carousel"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-pink-500" />
              Carousel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSheet(true)}
              disabled={listingPhotosLoading || listingPhotoUrls.length === 0}
              className="flex items-center gap-1.5"
            >
              <Video className="h-3.5 w-3.5" />
              {render ? 'New Video' : 'Generate Video'}
            </Button>
          </div>
        </div>

        {!loading && !render && listingPhotosLoading && (
          <p className="text-sm text-muted-foreground">Loading listing photos for video selection…</p>
        )}
        {!loading && !render && !listingPhotosLoading && listingPhotoUrls.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add photos above to create a video — clips use your website gallery images.
          </p>
        )}
        {!loading &&
          !render &&
          !listingPhotosLoading &&
          listingPhotoUrls.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Use the gallery photos above as video clips. Tap Generate Video to choose order, template, and voice.
            </p>
          )}

        {render?.output_url && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Created {formatRelativeTime(render.created_at)}</p>
            </div>
            <VideoPreviewPlayer videoUrl={render.output_url} />
            <div className="flex items-center gap-2">
              <a href={render.output_url} download target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </a>
              <Button
                size="sm"
                variant="outline"
                disabled={postingSocial}
                onClick={async () => {
                  setPostingSocial(true)
                  try {
                    const res = await fetch(`/api/vehicles/${vehicleId}/post`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ renderId: render.id }),
                    })
                    let data: {
                      ok?: boolean
                      partial?: boolean
                      failed?: boolean
                      error?: string
                      results?: { ok: boolean; message?: string; platform?: string }[]
                    } = {}
                    try {
                      data = await res.json()
                    } catch {
                      // Ignore
                    }
                    if (!res.ok) {
                      toast.error(typeof data.error === 'string' ? data.error : 'Could not post to social.')
                      return
                    }
                    if (data.ok) {
                      toast.success('Posted to your connected feeds.')
                    } else if (data.partial) {
                      toast.warning('Some platforms posted; check Social Posts below.')
                    } else {
                      const firstMsg =
                        Array.isArray(data.results) &&
                        typeof data.results[0]?.message === 'string'
                          ? data.results[0].message
                          : undefined
                      toast.error(firstMsg ?? 'Nothing was posted — check Organization → Social posting.')
                    }
                    setSocialLogRevision(prev => prev + 1)
                  } finally {
                    setPostingSocial(false)
                  }
                }}
              >
                {postingSocial ? 'Posting…' : 'Post to Social'}
              </Button>
            </div>
            <SocialPostStatus vehicleId={vehicleId} revision={socialLogRevision} />
          </div>
        )}

        {(render?.status === 'rendering' || render?.status === 'queued') && (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Your video is being created. This usually takes 2-3 minutes.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Started {formatRelativeTime(render.created_at)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive h-7 px-2"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        )}

        {render?.status === 'cancelled' && (
          <p className="text-sm text-muted-foreground">Video creation was cancelled.</p>
        )}

        {render?.status === 'failed' && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            Video creation failed. Try generating a new one.
          </div>
        )}
      </div>

      {showSheet && (
        <VideoOptionsSheet
          vehicleId={vehicleId}
          vehicleLabel={vehicleLabel}
          availablePhotos={listingPhotoUrls}
          onClose={() => setShowSheet(false)}
          onRenderStarted={handleRenderStarted}
        />
      )}

      {showCarouselSheet && (
        <CarouselSheet
          vehicleId={vehicleId}
          vehicleLabel={vehicleLabel}
          availablePhotos={listingPhotoUrls}
          onClose={() => setShowCarouselSheet(false)}
        />
      )}

      {showFacebookSheet && (
        <FacebookSheet
          vehicleId={vehicleId}
          vehicleLabel={vehicleLabel}
          availablePhotos={listingPhotoUrls}
          existingVideoUrl={render?.status === 'complete' ? (render.output_url ?? null) : null}
          onClose={() => setShowFacebookSheet(false)}
        />
      )}
    </>
  )
}
