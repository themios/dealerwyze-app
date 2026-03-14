'use client'

import { useState, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Upload, Check, X, ShieldAlert } from 'lucide-react'

const DOC_LABELS = ["Driver's License", 'Insurance Card', 'Purchase Agreement', 'Credit Application', 'Borrowed Vehicle', 'Test Drive', 'Other']
const PII_LABELS = new Set(["Driver's License", 'Insurance Card'])

async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file
  return new Promise<File>((resolve) => {
    const img = new window.Image()
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
  customerId: string
  customerName: string
  open: boolean
  onClose: () => void
}

export default function CustomerQuickUploadSheet({ customerId, customerName, open, onClose }: Props) {
  const [selectedLabel, setSelectedLabel] = useState("Driver's License")
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<string | null>(null)
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

      const res = await fetch(`/api/customers/${customerId}/documents`, { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(
          res.status === 413
            ? 'Storage limit reached. Free up space in Settings → Document Storage.'
            : res.status === 400 && data.error?.includes('5 MB')
              ? 'File too large. Please use a file under 5 MB.'
              : data.error ?? 'Upload failed. Please try again.'
        )
      } else {
        setUploaded(selectedLabel)
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
          <SheetTitle className="text-base">Attach Document — {customerName}</SheetTitle>
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

            {/* PII warning for sensitive labels */}
            {PII_LABELS.has(selectedLabel) && (
              <div className="flex items-start gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md px-3 py-2">
                <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                Contains sensitive PII. Not a system of record — maintain independent copies.
              </div>
            )}

            {/* Upload button */}
            <Button
              className="w-full h-12 gap-2 text-base"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading
                ? <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                : <Upload className="h-4 w-4" />}
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
              PDF, JPG, PNG · max 5 MB · images auto-compressed · not a system of record
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
