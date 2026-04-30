'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, GitMerge, Loader2, Paperclip, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MatchedVehicle {
  id: string
  stock_no: string
  year: number
  make: string
  model: string
  trim: string | null
  status: string
  match_type: 'vin' | 'ymm'
}

interface ExtractedData {
  vin?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  mileage?: number | null
  color?: string | null
  purchase_price?: number | null
  purchased_from?: string | null
  purchased_at?: string | null
  acquisition_source?: 'auction' | 'private' | 'trade_in' | 'dealer_trade' | 'other' | null
  auction_name?: string | null
  auction_lot?: string | null
  acquisition_notes?: string | null
  imageBase64?: string | null
  mimeType?: string | null
}

interface MergePreviewChange {
  field: string
  label: string
  mode: 'fill' | 'append'
  current: string | null
  incoming: string | null
  next: string | null
}

interface MergePreviewIgnored {
  field: string
  label: string
  current: string | null
  incoming: string | null
  reason: string
}

interface Props {
  match: MatchedVehicle
  extracted: ExtractedData
  onDismiss: () => void
  onAddNew: () => void
}

const STATUS_COLORS: Record<string, string> = {
  staging: 'bg-purple-100 text-purple-700',
  available: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-gray-100 text-gray-600',
}

export default function DuplicateMatchCard({ match, extracted, onDismiss, onAddNew }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'preview' | 'merge' | 'attach' | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [preview, setPreview] = useState<{
    additions: MergePreviewChange[]
    ignored: MergePreviewIgnored[]
  } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const label = `${match.year} ${match.make} ${match.model}${match.trim ? ` ${match.trim}` : ''}`

  async function handlePreviewMerge() {
    setLoading('preview')
    setPreviewError(null)
    setActionError(null)
    try {
      const res = await fetch(`/api/vehicles/${match.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extracted),
      })
      const data = await res.json()
      if (!res.ok) {
        setPreviewError(data.error ?? 'Could not compare the imported data.')
        return
      }
      setPreview({
        additions: data.additions ?? [],
        ignored: data.ignored ?? [],
      })
    } catch {
      setPreviewError('Could not compare the imported data.')
    } finally {
      setLoading(null)
    }
  }

  async function handleMerge() {
    setLoading('merge')
    setActionError(null)
    try {
      const res = await fetch(`/api/vehicles/${match.id}/merge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extracted),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not update the existing vehicle.')
        return
      }
      router.push(`/vehicles/${match.id}`)
    } catch {
      setActionError('Could not update the existing vehicle.')
    } finally {
      setLoading(null)
    }
  }

  async function handleAttach() {
    if (!extracted.imageBase64 || !extracted.mimeType) {
      router.push(`/vehicles/${match.id}`)
      return
    }
    setLoading('attach')
    setActionError(null)
    try {
      const byteString = atob(extracted.imageBase64)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], { type: extracted.mimeType })
      const ext = extracted.mimeType.split('/')[1] ?? 'jpg'
      const file = new File([blob], `intake-scan.${ext}`, { type: extracted.mimeType })

      const fd = new FormData()
      fd.append('file', file)
      fd.append('label', 'Intake scan')

      const res = await fetch(`/api/vehicles/${match.id}/documents`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not attach the intake scan.')
        return
      }
      router.push(`/vehicles/${match.id}`)
    } catch {
      setActionError('Could not attach the intake scan.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-4 my-3 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-400">
            {match.match_type === 'vin'
              ? 'VIN already in your inventory'
              : 'Similar vehicle found'}
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300 truncate">{label}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">Stock #{match.stock_no}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                STATUS_COLORS[match.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {match.status}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {!preview ? (
          <Button
            className="w-full justify-start gap-2 bg-white dark:bg-gray-900 text-foreground border hover:bg-muted h-10"
            variant="outline"
            onClick={handlePreviewMerge}
            disabled={!!loading}
          >
            {loading === 'preview'
              ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              : <GitMerge className="h-4 w-4 text-blue-500" />}
            <span className="text-sm">Review update to existing vehicle</span>
          </Button>
        ) : (
          <div className="rounded-lg border bg-white/80 dark:bg-gray-950/60 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">This vehicle already exists in inventory.</p>
              <p className="text-xs text-muted-foreground">
                Review the imported details first. Nothing on the existing vehicle will be deleted.
              </p>
            </div>

            {preview.additions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Will add
                </p>
                <div className="space-y-2">
                  {preview.additions.map(change => (
                    <div
                      key={`${change.field}-${change.label}`}
                      className="rounded-md border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{change.label}</span>
                        <span className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                          {change.mode === 'append' ? 'Append' : 'Add'}
                        </span>
                      </div>
                      {change.current ? (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          Current: {change.current}
                        </p>
                      ) : null}
                      {change.incoming ? (
                        <p className="mt-1 text-xs text-foreground line-clamp-3">
                          Imported: {change.incoming}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-muted px-3 py-2 text-xs text-muted-foreground">
                No new details would be added from this import.
              </div>
            )}

            {preview.ignored.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Will not change
                </p>
                <div className="space-y-2">
                  {preview.ignored.map(change => (
                    <div
                      key={`${change.field}-${change.label}`}
                      className="rounded-md border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2"
                    >
                      <p className="text-sm font-medium">{change.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        Current: {change.current || 'Empty'}
                      </p>
                      <p className="mt-1 text-xs text-foreground line-clamp-2">
                        Imported: {change.incoming || 'Empty'}
                      </p>
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{change.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleMerge}
                disabled={!!loading || preview.additions.length === 0}
              >
                {loading === 'merge' ? 'Updating…' : 'Update existing vehicle'}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => {
                  setPreview(null)
                  setPreviewError(null)
                }}
                disabled={!!loading}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {previewError && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {previewError}
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {actionError}
          </div>
        )}

        {extracted.imageBase64 && (
          <Button
            className="w-full justify-start gap-2 bg-white dark:bg-gray-900 text-foreground border hover:bg-muted h-10"
            variant="outline"
            onClick={handleAttach}
            disabled={!!loading}
          >
            <Paperclip className="h-4 w-4 text-green-500" />
            <span className="text-sm">Attach photo to existing vehicle</span>
          </Button>
        )}

        {!confirmNew ? (
          <Button
            className="w-full justify-start gap-2 h-10"
            variant="ghost"
            onClick={() => setConfirmNew(true)}
            disabled={!!loading}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add as new anyway</span>
          </Button>
        ) : (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 p-3 space-y-2">
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">
              This will create a duplicate in your inventory.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={onAddNew}
                disabled={!!loading}
                className="flex-1"
              >
                Add anyway
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmNew(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Button variant="ghost" className="w-full" onClick={onDismiss} disabled={!!loading}>
          Go back
        </Button>
      </div>
    </div>
  )
}
