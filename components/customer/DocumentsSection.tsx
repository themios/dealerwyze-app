'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Image, Trash2, Upload, X, Download, Eye, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CustomerDocument {
  id: string
  label: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  signed_url: string
  created_at: string
}

interface Props {
  customerId: string
}

const LABEL_OPTIONS = [
  "Driver's License",
  'Insurance Card',
  'Purchase Agreement',
  'Credit Application',
  'Borrowed Vehicle',
  'Test Drive',
  'Other',
]

// Labels that contain sensitive PII — show a warning
const PII_LABELS = new Set(["Driver's License", 'Insurance Card'])

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith('image/')) {
    return <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
}

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
      canvas.width = width
      canvas.height = height
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

export default function DocumentsSection({ customerId }: Props) {
  const [docs, setDocs] = useState<CustomerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadLabel, setUploadLabel] = useState(LABEL_OPTIONS[0])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [viewingDoc, setViewingDoc] = useState<{ signed_url: string; label: string; mime_type: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchDocs() {
    setFetchError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}/documents`)
      if (!res.ok) throw new Error('Failed to load documents')
      const data: CustomerDocument[] = await res.json()
      setDocs(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setUploadError(null)

    if (raw.size > 5 * 1024 * 1024) {
      setUploadError('File too large. Please use a file under 5 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const file = await compressImage(raw)
      const form = new FormData()
      form.append('file', file)
      form.append('label', uploadLabel)
      const res = await fetch(`/api/customers/${customerId}/documents`, { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) {
        setUploadError(
          res.status === 413
            ? 'Storage limit reached. Free up space in Settings → Vehicle Documents.'
            : res.status === 400 && body.error?.includes('5 MB')
              ? 'File too large. Please use a file under 5 MB.'
              : body.error ?? 'Upload failed. Please try again.'
        )
      } else {
        setShowUpload(false)
        setUploadLabel(LABEL_OPTIONS[0])
        if (fileInputRef.current) fileInputRef.current.value = ''
        setDocs(prev => [body, ...prev])
      }
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function cancelUpload() {
    setShowUpload(false)
    setUploadLabel(LABEL_OPTIONS[0])
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(docId: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setConfirmDeleteId(null)
      setDocs(prev => prev.filter(d => d.id !== docId))
    } catch {
      // silently reset
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="border-b">
      {/* Section header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-l-2 border-[#F07018] pl-2">
          Documents
          {docs.length > 0 && <span className="font-normal ml-1.5">({docs.length})</span>}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => { setShowUpload(v => !v); setUploadError(null) }}
          aria-label="Upload document"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* PII notice when sensitive label is selected */}
      {showUpload && PII_LABELS.has(uploadLabel) && (
        <div className="mx-4 mb-2 flex items-start gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md px-3 py-2">
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          Contains sensitive customer PII. Do not share this file externally. DealerWyze is not a certified system of record — maintain independent backups.
        </div>
      )}

      {/* Inline upload form */}
      {showUpload && (
        <div className="mx-4 mb-3 p-3 rounded-lg border bg-muted/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Attach Document</p>
            <button onClick={cancelUpload} aria-label="Cancel upload">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Label chips */}
          <div className="flex flex-wrap gap-1.5">
            {LABEL_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setUploadLabel(opt)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                  uploadLabel === opt
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading
              ? <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
              : <Upload className="h-3.5 w-3.5" />}
            {uploading ? 'Uploading…' : 'Choose File or Take Photo'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {uploadError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {uploadError}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            PDF, JPG, PNG · max 5 MB · images auto-compressed · not a system of record
          </p>
        </div>
      )}

      {/* Document list */}
      <div className="px-4 pb-1">
        {loading && <p className="text-xs text-muted-foreground py-2">Loading…</p>}
        {fetchError && <p className="text-xs text-destructive py-2">{fetchError}</p>}
        {!loading && !fetchError && docs.length === 0 && !showUpload && (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">No documents yet.</p>
            <button
              className="mt-1 text-xs text-[#F07018] underline-offset-2 hover:underline"
              onClick={() => setShowUpload(true)}
            >
              Attach one now
            </button>
          </div>
        )}
        {!loading && docs.length > 0 && (
          <ul className="divide-y">
            {docs.map(doc => (
              <li key={doc.id} className="py-2.5 flex items-start gap-2.5">
                <div className="mt-0.5">
                  <DocIcon mimeType={doc.mime_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium leading-tight truncate">{doc.label}</p>
                    {PII_LABELS.has(doc.label) && (
                      <ShieldAlert className="h-3 w-3 text-amber-500 flex-shrink-0" title="Contains sensitive PII" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.file_name}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setViewingDoc({ signed_url: doc.signed_url, label: doc.label, mime_type: doc.mime_type ?? '' })}
                    aria-label={`View ${doc.label}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <a href={doc.signed_url} target="_blank" rel="noopener noreferrer" aria-label={`Download ${doc.label}`}>
                    <Button variant="ghost" size="icon-xs" asChild>
                      <span><Download className="h-3.5 w-3.5" /></span>
                    </Button>
                  </a>
                  {confirmDeleteId === doc.id ? (
                    <span className="flex items-center gap-1">
                      <Button variant="destructive" size="xs" onClick={() => handleDelete(doc.id)} disabled={deleting}>
                        {deleting ? '…' : 'Delete?'}
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setConfirmDeleteId(null)} aria-label="Cancel delete">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setConfirmDeleteId(doc.id)}
                      aria-label={`Delete ${doc.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Fullscreen document viewer */}
      {viewingDoc && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={viewingDoc.label}
          onClick={() => setViewingDoc(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-white truncate max-w-[80vw]">{viewingDoc.label}</p>
            <button onClick={() => setViewingDoc(null)} aria-label="Close viewer" className="text-white/70 hover:text-white ml-4">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden px-4 pb-4" onClick={e => e.stopPropagation()}>
            {viewingDoc.mime_type.startsWith('image/') ? (
              <img src={viewingDoc.signed_url} alt={viewingDoc.label} className="max-w-full max-h-full object-contain" />
            ) : viewingDoc.mime_type === 'application/pdf' ? (
              <iframe src={viewingDoc.signed_url} title={viewingDoc.label} className="w-full h-full" />
            ) : (
              <p className="text-white/70 text-sm">Preview not available for this file type.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
