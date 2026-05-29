'use client'

import { useState, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Upload, Check, X } from 'lucide-react'
import { useVertical } from '@/hooks/useVertical'

const DOC_LABELS_DEALER = ['Carfax', 'Autocheck', 'KBB', 'Title', 'Inspection', 'Window Sticker', 'Other']
const DOC_LABELS_RE     = ['Seller disclosure', 'Inspection report', 'Appraisal', 'Floor plan', 'HOA documents', 'Purchase agreement', 'Title / escrow', 'Other']

async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file
  return new Promise<File>((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX_DIM = 2048
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          : file),
        'image/jpeg', 0.82
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

interface Props {
  vehicleId: string
  vehicleLabel: string
  open: boolean
  onClose: () => void
}

export default function VehicleQuickUploadSheet({ vehicleId, vehicleLabel, open, onClose }: Props) {
  const { vertical } = useVertical()
  const DOC_LABELS = vertical === 'real_estate' ? DOC_LABELS_RE : DOC_LABELS_DEALER
  const [selectedLabel, setSelectedLabel] = useState(DOC_LABELS[0])
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<string | null>(null) // label of last uploaded doc
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setUploaded(null)
    setError(null)
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setError(null)
    setUploading(true)

    try {
      const file = await compressImage(raw)
      const form = new FormData()
      form.append('file', file)
      form.append('label', selectedLabel)

      const res = await fetch(`/api/vehicles/${vehicleId}/documents`, { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(
          res.status === 413
            ? 'Storage limit reached. Free up space in Settings → Vehicle Documents.'
            : res.status === 400 && data.error?.includes('5 MB')
              ? 'File too large. Please use a file under 5 MB.'
              : data.error ?? 'Upload failed. Please try again.'
        )
      } else {
        setUploaded(selectedLabel)
        // Auto-close after 1.5s on success
        setTimeout(() => handleClose(), 1500)
      }
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">Attach Document — {vehicleLabel}</SheetTitle>
        </SheetHeader>

        {uploaded ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">{uploaded} uploaded successfully</p>
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {/* Label chips */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Document type</p>
              <div className="flex flex-wrap gap-2">
                {DOC_LABELS.map(l => (
                  <button
                    key={l}
                    onClick={() => setSelectedLabel(l)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                      selectedLabel === l
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload button */}
            <Button
              className="w-full h-12 gap-2 text-base"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Choose File or Take Photo'}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFile}
            />

            {error && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2.5">
                <X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              PDF, JPG, PNG · max 5 MB · images auto-compressed
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
