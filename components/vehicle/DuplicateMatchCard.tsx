'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, GitMerge, Paperclip, Plus } from 'lucide-react'
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
  imageBase64?: string | null
  mimeType?: string | null
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

export default function DuplicateMatchCard({ match, extracted, onDismiss: _onDismiss, onAddNew }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'merge' | 'attach' | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)

  const label = `${match.year} ${match.make} ${match.model}${match.trim ? ` ${match.trim}` : ''}`

  async function handleMerge() {
    setLoading('merge')
    try {
      await fetch(`/api/vehicles/${match.id}/merge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extracted),
      })
    } catch {
      // best-effort
    }
    setLoading(null)
    router.push(`/vehicles/${match.id}`)
  }

  async function handleAttach() {
    if (!extracted.imageBase64 || !extracted.mimeType) {
      router.push(`/vehicles/${match.id}`)
      return
    }
    setLoading('attach')
    try {
      // Convert base64 to Blob, then FormData — matching the existing documents POST route
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

      await fetch(`/api/vehicles/${match.id}/documents`, {
        method: 'POST',
        body: fd,
      })
    } catch {
      // best-effort
    }
    setLoading(null)
    router.push(`/vehicles/${match.id}`)
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
        {/* Merge */}
        <Button
          className="w-full justify-start gap-2 bg-white dark:bg-gray-900 text-foreground border hover:bg-muted h-10"
          variant="outline"
          onClick={handleMerge}
          disabled={!!loading}
        >
          <GitMerge className="h-4 w-4 text-blue-500" />
          <span className="text-sm">Update existing vehicle with new info</span>
        </Button>

        {/* Attach photo — only if image was captured */}
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

        {/* Add as new — requires confirmation */}
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
      </div>
    </div>
  )
}
