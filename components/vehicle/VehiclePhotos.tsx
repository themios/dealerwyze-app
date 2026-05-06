'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Camera, Trash2, Star, Plus, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import VehicleVideoSection from '@/components/vehicles/VehicleVideoSection'

interface Photo {
  id: string
  url: string
  position: number
}

const MAX_DIM = 1920

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => resolve(blob ?? new Blob()), 'image/jpeg', 0.82)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(new Blob())
    }
    img.src = url
  })
}

export default function VehiclePhotos({
  vehicleId,
  vehicleLabel,
  showVideoSection = false,
}: {
  vehicleId: string
  /** Required when `showVideoSection` — same label as video / social flows */
  vehicleLabel?: string
  /** Renders video tools under the gallery, using the **same** URLs as listing photos */
  showVideoSection?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPhotos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/photos`)
      if (res.ok) setPhotos(await res.json())
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  const persistOrder = useCallback(
    async (orderedIds: string[]) => {
      const res = await fetch(`/api/vehicles/${vehicleId}/photos/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) {
        setError('Could not save photo order.')
        await loadPhotos()
      } else {
        setError(null)
      }
    },
    [vehicleId, loadPhotos],
  )

  /** Load listing photos eagerly when video is tied to this gallery so the render sheet always stays in sync */
  useEffect(() => {
    if (photos.length === 0 && (open || showVideoSection)) void loadPhotos()
  }, [open, photos.length, loadPhotos, showVideoSection])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)

    const fileArray = Array.from(files).slice(0, 20 - photos.length)
    let completed = 0

    for (const file of fileArray) {
      try {
        const compressed = await compressImage(file)
        if (compressed.size === 0) continue

        const fd = new FormData()
        fd.append('file', new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))

        const res = await fetch(`/api/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          body: fd,
        })

        if (res.ok) {
          const photo = await res.json()
          setPhotos(prev => [...prev, photo].sort((a, b) => a.position - b.position))
        } else {
          const d = await res.json()
          setError(d.error ?? 'Upload failed')
          break
        }
      } catch {
        setError('Upload failed — please try again.')
        break
      }
      completed++
      setUploadProgress(Math.round((completed / fileArray.length) * 100))
    }

    setUploading(false)
    setUploadProgress(0)
  }

  const deletePhoto = async (photoId: string) => {
    const res = await fetch(`/api/vehicles/${vehicleId}/photos/${photoId}`, { method: 'DELETE' })
    if (res.ok) {
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    }
    setConfirmDelete(null)
  }

  const setPrimary = async (photoId: string) => {
    const res = await fetch(`/api/vehicles/${vehicleId}/photos/${photoId}`, { method: 'PATCH' })
    if (res.ok) {
      setPhotos(prev => {
        const selected = prev.find(p => p.id === photoId)!
        return [
          { ...selected, position: 0 },
          ...prev.filter(p => p.id !== photoId).map((p, i) => ({ ...p, position: i + 1 })),
        ]
      })
    }
  }

  const reorderByDrop = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setPhotos(prev => {
      const si = prev.findIndex(p => p.id === sourceId)
      const ti = prev.findIndex(p => p.id === targetId)
      if (si < 0 || ti < 0) return prev
      const next = [...prev]
      const [item] = next.splice(si, 1)
      next.splice(ti, 0, item)
      const withPos = next.map((p, i) => ({ ...p, position: i }))
      void persistOrder(withPos.map(p => p.id))
      return withPos
    })
    setDragOverId(null)
  }

  const listingPhotoUrls = useMemo(() => photos.map(p => p.url), [photos])

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Photos{' '}
            {photos.length > 0 ? `(${photos.length})` : ''}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photos.length >= 20}
              className="flex items-center gap-2 px-3 py-2 text-sm border-2 border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 hover:bg-accent transition-colors disabled:opacity-50 w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              {uploading
                ? `Uploading... ${uploadProgress}%`
                : photos.length === 0
                  ? 'Add photos'
                  : `Add more (${photos.length}/20)`}
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}

          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Drag thumbnails to set the gallery order (public listing &amp; video). The starred image is the cover
              thumbnail.
            </p>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  onDragOver={e => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverId(photo.id)
                  }}
                  onDragLeave={() => setDragOverId(id => (id === photo.id ? null : id))}
                  onDrop={e => {
                    e.preventDefault()
                    const sourceId = e.dataTransfer.getData('text/plain')
                    reorderByDrop(sourceId, photo.id)
                  }}
                  className={cn(
                    'relative group aspect-square rounded-lg overflow-hidden bg-muted ring-2 ring-transparent transition-[ring-color]',
                    dragOverId === photo.id && 'ring-primary',
                  )}
                >
                  <div
                    draggable
                    role="button"
                    tabIndex={0}
                    title="Drag to reorder photos"
                    aria-label="Drag to reorder"
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', photo.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setDragOverId(null)}
                    className="absolute left-1 bottom-1 z-10 rounded bg-black/55 p-0.5 cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-white" aria-hidden />
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="Vehicle photo" className="w-full h-full object-cover pointer-events-none" />

                  {photo.position === 0 && (
                    <div className="absolute top-1 right-1 bg-amber-500 rounded-full p-0.5">
                      <Star className="h-2.5 w-2.5 text-white fill-white" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {photo.position !== 0 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setPrimary(photo.id)
                        }}
                        className="bg-white/90 rounded-full p-1.5"
                        title="Set as cover photo"
                      >
                        <Star className="h-3 w-3 text-amber-500" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setConfirmDelete(photo.id)
                      }}
                      className="bg-white/90 rounded-full p-1.5"
                      title="Delete photo"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>

                  {confirmDelete === photo.id && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-2 z-20">
                      <p className="text-white text-[10px] text-center font-medium">Delete this photo?</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => deletePhoto(photo.id)}
                          className="bg-destructive text-white text-[10px] px-2 py-1 rounded"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="bg-white/20 text-white text-[10px] px-2 py-1 rounded"
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && photos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No photos yet. Add photos to show on your public listing.
            </p>
          )}
        </div>
      )}

      {showVideoSection && vehicleLabel ? (
        <div className="border-t border-border/80 bg-background">
          <VehicleVideoSection
            vehicleId={vehicleId}
            vehicleLabel={vehicleLabel}
            listingPhotoUrls={listingPhotoUrls}
            listingPhotosLoading={loading}
          />
        </div>
      ) : null}
    </div>
  )
}
