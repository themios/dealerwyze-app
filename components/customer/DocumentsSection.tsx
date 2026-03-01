'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Image, Trash2, Upload, X, Download, Eye } from 'lucide-react'
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
  'Vehicle Title',
  'Bill of Sale',
  'Other',
]

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

export default function DocumentsSection({ customerId }: Props) {
  const [docs, setDocs] = useState<CustomerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Upload form state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadLabel, setUploadLabel] = useState(LABEL_OPTIONS[0])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Inline viewer state
  const [viewingDoc, setViewingDoc] = useState<{ signed_url: string; label: string; mime_type: string } | null>(null)

  // Per-row delete confirm state
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setUploadError(null)
    if (file && file.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds 10 MB limit.')
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploadFile(file)
  }

  async function handleUpload() {
    if (!uploadFile) {
      setUploadError('Please select a file.')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      form.append('label', uploadLabel)
      const res = await fetch(`/api/customers/${customerId}/documents`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? 'Upload failed')
      }
      // Reset form and refresh list
      setShowUpload(false)
      setUploadLabel(LABEL_OPTIONS[0])
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchDocs()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function cancelUpload() {
    setShowUpload(false)
    setUploadLabel(LABEL_OPTIONS[0])
    setUploadFile(null)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(docId: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/documents/${docId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')
      setConfirmDeleteId(null)
      await fetchDocs()
    } catch {
      // silently reset — row stays visible
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

      {/* Document list */}
      <div className="px-4 pb-1">
        {loading && (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        )}
        {fetchError && (
          <p className="text-xs text-destructive py-2">{fetchError}</p>
        )}
        {!loading && !fetchError && docs.length === 0 && !showUpload && (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">No documents yet.</p>
            <button
              className="mt-1 text-xs text-[#F07018] underline-offset-2 hover:underline"
              onClick={() => setShowUpload(true)}
            >
              Upload one now
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
                  <p className="text-sm font-medium leading-tight truncate">{doc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.file_name}
                    {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}
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
                  <a
                    href={doc.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download ${doc.label}`}
                  >
                    <Button variant="ghost" size="icon-xs" asChild>
                      <span>
                        <Download className="h-3.5 w-3.5" />
                      </span>
                    </Button>
                  </a>

                  {confirmDeleteId === doc.id ? (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleting}
                      >
                        {deleting ? '…' : 'Delete?'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancel delete"
                      >
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

      {/* Inline upload form */}
      {showUpload && (
        <div className="mx-4 mb-3 p-3 rounded-lg border bg-muted/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Upload Document</p>
            <button onClick={cancelUpload} aria-label="Cancel upload">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Label select */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="doc-label">
              Label
            </label>
            <select
              id="doc-label"
              value={uploadLabel}
              onChange={e => setUploadLabel(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              {LABEL_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* File input */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="doc-file">
              File <span className="text-muted-foreground/60">(Max 10 MB · PDF or image)</span>
            </label>
            <input
              id="doc-file"
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="w-full text-sm text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[#0D2B55] file:text-white cursor-pointer"
            />
          </div>

          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}

          <div className="flex gap-2 pt-0.5">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelUpload}
              disabled={uploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Inline document viewer modal */}
      {viewingDoc && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={viewingDoc.label}
          onClick={() => setViewingDoc(null)}
        >
          {/* Header bar */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-white truncate max-w-[80vw]">{viewingDoc.label}</p>
            <button
              onClick={() => setViewingDoc(null)}
              aria-label="Close viewer"
              className="text-white/70 hover:text-white ml-4"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content area */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden px-4 pb-4"
            onClick={e => e.stopPropagation()}
          >
            {viewingDoc.mime_type.startsWith('image/') ? (
              <img
                src={viewingDoc.signed_url}
                alt={viewingDoc.label}
                className="max-w-full max-h-full object-contain"
              />
            ) : viewingDoc.mime_type === 'application/pdf' ? (
              <iframe
                src={viewingDoc.signed_url}
                title={viewingDoc.label}
                className="w-full h-full"
              />
            ) : (
              <p className="text-white/70 text-sm">Preview not available for this file type.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
