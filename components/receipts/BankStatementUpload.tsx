'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Loader2, X, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'

async function fileToBase64(
  file: File
): Promise<{ base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' }> {
  if (file.type === 'application/pdf') {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return { base64: btoa(binary), mimeType: 'application/pdf' }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    const maxPx = 1600
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
      const mimeType: 'image/jpeg' | 'image/png' | 'image/webp' =
        file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
      const dataUrl = canvas.toDataURL(mimeType === 'image/png' ? 'image/png' : 'image/jpeg', 0.92)
      resolve({ base64: dataUrl.split(',')[1], mimeType })
    }
    img.onerror = reject
    img.src = url
  })
}

export default function BankStatementUpload() {
  const router = useRouter()
  const imageRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setUploading(false)
    setError(null)
  }

  async function uploadImage(file: File) {
    setUploadLabel('Reading bank statement…')
    const { base64, mimeType } = await fileToBase64(file)
    const res = await fetch('/api/receipts/bank-statements/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64, mime_type: mimeType }),
      signal: abortRef.current?.signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Upload failed')
    router.push(`/receipts/reconcile/${data.statement_id}`)
  }

  async function uploadCsv(file: File) {
    setUploadLabel('Parsing CSV…')
    const csv_text = await file.text()
    const res = await fetch('/api/receipts/bank-statements/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text }),
      signal: abortRef.current?.signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'CSV import failed')
    router.push(`/receipts/reconcile/${data.statement_id}`)
  }

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    abortRef.current = new AbortController()
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv'
      if (isCsv) await uploadCsv(file)
      else await uploadImage(file)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(String(e))
      setUploading(false)
    }
  }

  return (
    <div className="px-4 mt-3 space-y-2">
      <input
        ref={imageRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      {uploading ? (
        <div className="flex items-center gap-3 rounded-xl bg-blue-500/10 border border-blue-500/20 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">{uploadLabel}</p>
            <p className="text-xs text-muted-foreground">Matching transactions to your ledger</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="flex-shrink-0 text-muted-foreground hover:text-foreground h-8 px-2"
            onClick={handleCancel}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            variant="outline"
            className="h-12 flex items-center justify-center gap-2 text-sm border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/20"
            onClick={() => imageRef.current?.click()}
          >
            <Landmark className="h-5 w-5" />
            PDF / Image
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 flex items-center justify-center gap-2 text-sm"
            onClick={() => csvRef.current?.click()}
          >
            <FileSpreadsheet className="h-5 w-5" />
            Import CSV
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive text-center break-all">{error}</p>
      )}
    </div>
  )
}
