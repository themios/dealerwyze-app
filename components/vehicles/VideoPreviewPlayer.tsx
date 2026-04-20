'use client'

import { Video } from 'lucide-react'

interface VideoPreviewPlayerProps {
  videoUrl?: string | null
  className?: string
}

export default function VideoPreviewPlayer({ videoUrl, className = '' }: VideoPreviewPlayerProps) {
  if (!videoUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted rounded-xl aspect-video ${className}`}>
        <Video className="h-10 w-10 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Video preview will appear here when ready</p>
      </div>
    )
  }

  return (
    <video
      src={videoUrl}
      controls
      playsInline
      preload="metadata"
      className={`w-full rounded-xl bg-black aspect-video ${className}`}
    />
  )
}
