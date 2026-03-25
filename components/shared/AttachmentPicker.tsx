'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Paperclip, X, File, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface Attachment {
  filename: string
  contentType: string
  /** Supabase signed URL — server will fetch the bytes */
  signedUrl?: string
  /** Base64-encoded content for local uploads */
  base64?: string
  /** Display size string e.g. "1.2 MB" */
  sizeLabel?: string
}

interface VehicleDoc {
  id: string
  label: string
  file_name: string
  mime_type: string | null
  signed_url: string
  file_size: number | null
}

interface AttachmentPickerProps {
  vehicleId?: string | null
  /** 'email' supports local files too; 'sms' only vehicle docs (needs public URL) */
  mode?: 'email' | 'sms'
  selected: Attachment[]
  onChange: (next: Attachment[]) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const MAX_LOCAL_BYTES = 3 * 1024 * 1024 // 3 MB per file

export default function AttachmentPicker({ vehicleId, mode = 'email', selected, onChange }: AttachmentPickerProps) {
  const [open, setOpen] = useState(false)
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDoc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!open || !vehicleId) return
    setLoadingDocs(true)
    supabase
      .from('vehicle_documents')
      .select('id, label, file_name, mime_type, file_size')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(async ({ data }) => {
        if (!data?.length) { setVehicleDocs([]); setLoadingDocs(false); return }
        // Get signed URLs
        const withUrls = await Promise.all(
          data.map(async (doc) => {
            const { data: signed } = await supabase.storage
              .from('vehicle-docs')
              .createSignedUrl(`${vehicleId}/${doc.file_name}`, 3600)
            return { ...doc, signed_url: signed?.signedUrl ?? '' }
          })
        )
        setVehicleDocs(withUrls.filter(d => !!d.signed_url) as VehicleDoc[])
        setLoadingDocs(false)
      })
  }, [open, vehicleId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!file) return
    if (file.size > MAX_LOCAL_BYTES) {
      alert('File too large (max 3 MB). Please choose a smaller file.')
      e.target.value = ''
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
    e.target.value = ''
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
            </>
          )}

          {/* Local file picker — email only */}
          {mode === 'email' && (
            <>
              {vehicleId && <div className="border-t pt-2" />}
              <p className="text-xs font-medium text-muted-foreground">From your device</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Choose file (max 3 MB)
              </Button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={handleLocalFile}
              />
            </>
          )}

          {mode === 'sms' && !vehicleId && (
            <p className="text-xs text-muted-foreground">Link a vehicle to this lead to attach documents.</p>
          )}
        </div>
      )}
    </div>
  )
}
