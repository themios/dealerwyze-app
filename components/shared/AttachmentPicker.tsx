'use client'

import { useState, useEffect, useRef } from 'react'
import { Paperclip, X, File, Upload, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface Attachment {
  filename: string
  contentType: string
  /** Supabase signed URL — server will fetch the bytes */
  signedUrl?: string
  /** Base64-encoded content for local uploads (email only) */
  base64?: string
  /** Display size string e.g. "1.2 MB" */
  sizeLabel?: string
}

interface VehicleDoc {
  id: string
  label: string
  file_name: string
  file_key: string
  mime_type: string | null
  signed_url: string
  file_size: number | null
}

interface AttachmentPickerProps {
  vehicleId?: string | null
  /** 'email' attaches files as base64; 'sms' uploads to storage for a public URL (required by Twilio MMS) */
  mode?: 'email' | 'sms'
  selected: Attachment[]
  onChange: (next: Attachment[]) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const EMAIL_MAX_BYTES = 3 * 1024 * 1024
const SMS_MAX_BYTES   = 5 * 1024 * 1024

// MMS-compatible types Twilio accepts (images, video, PDF)
const SMS_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,application/pdf'

export default function AttachmentPicker({ vehicleId, mode = 'email', selected, onChange }: AttachmentPickerProps) {
  const [open, setOpen]               = useState(false)
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDoc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !vehicleId) return
    setLoadingDocs(true)
    fetch(`/api/vehicles/${vehicleId}/documents`)
      .then(r => r.ok ? r.json() : [])
      .then((data: VehicleDoc[]) => {
        setVehicleDocs((data ?? []).filter(d => !!d.signed_url))
        setLoadingDocs(false)
      })
      .catch(() => { setVehicleDocs([]); setLoadingDocs(false) })
  }, [open, vehicleId])  

  function isSelected(doc: VehicleDoc) {
    return selected.some(a => a.signedUrl === doc.signed_url || a.filename === doc.file_name)
  }

  function toggleDoc(doc: VehicleDoc) {
    if (isSelected(doc)) {
      onChange(selected.filter(a => a.signedUrl !== doc.signed_url && a.filename !== doc.file_name))
    } else {
      onChange([...selected, {
        filename:    doc.label || doc.file_name,
        contentType: doc.mime_type ?? 'application/octet-stream',
        signedUrl:   doc.signed_url,
        sizeLabel:   doc.file_size ? formatSize(doc.file_size) : undefined,
      }])
    }
  }

  async function handleLocalFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)

    if (mode === 'sms') {
      if (file.size > SMS_MAX_BYTES) {
        setUploadError('File too large (max 5 MB for MMS).')
        return
      }
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/media/upload', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) { setUploadError(data.error ?? 'Upload failed'); return }
        onChange([...selected, {
          filename:    file.name,
          contentType: file.type || 'application/octet-stream',
          signedUrl:   data.signed_url,
          sizeLabel:   formatSize(file.size),
        }])
      } catch {
        setUploadError('Upload failed. Check your connection and try again.')
      } finally {
        setUploading(false)
      }
    } else {
      if (file.size > EMAIL_MAX_BYTES) {
        setUploadError('File too large (max 3 MB).')
        return
      }
      const ab = await file.arrayBuffer()
      const base64 = Buffer.from(ab).toString('base64')
      onChange([...selected, {
        filename:    file.name,
        contentType: file.type || 'application/octet-stream',
        base64,
        sizeLabel:   formatSize(file.size),
      }])
    }
  }

  function removeAttachment(idx: number) {
    onChange(selected.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((a, i) => (
            <div key={i} className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs">
              <File className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="max-w-[160px] truncate">{a.filename}</span>
              {a.sizeLabel && <span className="text-muted-foreground">· {a.sizeLabel}</span>}
              <button onClick={() => removeAttachment(i)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5" />
        Attach {selected.length > 0 ? `(${selected.length})` : ''}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          {/* Vehicle documents */}
          {vehicleId && (
            <>
              <p className="text-xs font-medium text-muted-foreground">Vehicle documents</p>
              {loadingDocs ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : vehicleDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No documents on this vehicle yet.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {vehicleDocs.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDoc(doc)}
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        isSelected(doc) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent'
                      }`}
                    >
                      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{doc.label || doc.file_name}</span>
                      {doc.file_size && <span className="text-muted-foreground shrink-0">{formatSize(doc.file_size)}</span>}
                      {isSelected(doc) && <X className="h-3 w-3 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t pt-2" />
            </>
          )}

          {/* From device — both modes */}
          <p className="text-xs font-medium text-muted-foreground">From your device</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
              : <><Upload className="h-3.5 w-3.5" />Choose file{mode === 'sms' ? ' (max 5 MB)' : ' (max 3 MB)'}</>
            }
          </Button>
          {mode === 'sms' && (
            <p className="text-xs text-muted-foreground">Images, GIF, MP4, PDF. Opens your files, photos, or cloud storage.</p>
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept={mode === 'sms' ? SMS_ACCEPT : undefined}
            className="hidden"
            onChange={handleLocalFile}
          />
        </div>
      )}
    </div>
  )
}
