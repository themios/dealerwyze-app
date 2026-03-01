'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

async function resizeImage(
  file: File,
  maxPx = 1024
): Promise<{ base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width)
          width = maxPx
        } else {
          width = Math.round((width * maxPx) / height)
          height = maxPx
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
      resolve({ base64, mimeType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = url
  })
}

export default function CaptureClient() {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const { base64, mimeType } = await resizeImage(file)
      const res = await fetch('/api/receipts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          mime_type: mimeType,
          filename: file.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      router.push(`/receipts/${data.receipt.id}/review`)
    } catch (e) {
      setError(String(e))
      setUploading(false)
    }
  }

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      {uploading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-primary/10 border border-primary/20 p-5">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-semibold text-primary">Reading receipt…</p>
            <p className="text-xs text-muted-foreground">AI is extracting and classifying</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-16 flex-col gap-1.5 text-sm bg-[#F07018] hover:bg-[#d95e10] text-white"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-6 w-6" />
            Snap Receipt
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 flex-col gap-1.5 text-sm"
            onClick={() => uploadRef.current?.click()}
          >
            <Upload className="h-5 w-5" />
            Upload File
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-destructive text-center break-all">{error}</p>
      )}
    </div>
  )
}
