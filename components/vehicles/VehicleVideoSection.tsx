'use client'

import { useState, useEffect } from 'react'
import { Video, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VideoOptionsSheet from './VideoOptionsSheet'
import VideoPreviewPlayer from './VideoPreviewPlayer'
import RenderStatusBadge from './RenderStatusBadge'
import SocialPostStatus from './SocialPostStatus'

interface VehicleVideoSectionProps {
  vehicleId: string
  vehicleLabel: string
  photos: string[]
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

export default function VehicleVideoSection({ vehicleId, vehicleLabel, photos }: VehicleVideoSectionProps) {
  const [showSheet, setShowSheet]     = useState(false)
  const [render, setRender]           = useState<RenderInfo | null>(null)
  const [loading, setLoading]         = useState(true)
  const [cancelling, setCancelling]   = useState(false)

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
      <div className="border rounded-xl p-4 space-y-3">
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
              onClick={() => setShowSheet(true)}
              className="flex items-center gap-1.5"
            >
              <Video className="h-3.5 w-3.5" />
              {render ? 'New Video' : 'Generate Video'}
            </Button>
          </div>
        </div>

        {!loading && !render && (
          <p className="text-sm text-muted-foreground">
            Create a branded video for this vehicle to share on social media.
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
                onClick={async () => {
                  await fetch(`/api/vehicles/${vehicleId}/post`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ renderId: render.id }),
                  })
                }}
              >
                Post to Social
              </Button>
            </div>
            <SocialPostStatus vehicleId={vehicleId} />
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
          availablePhotos={photos}
          onClose={() => setShowSheet(false)}
          onRenderStarted={handleRenderStarted}
        />
      )}
    </>
  )
}
