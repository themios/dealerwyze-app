'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, AlertCircle, ChevronRight, Trash2 } from 'lucide-react'
import { formatRelative } from '@/lib/utils/relativeTime'

interface DraftReceipt {
  id: string
  status: string
  entry_type?: string
  vendor_norm: string | null
  vendor_raw: string | null
  payer?: string | null
  total: number | null
  receipt_date: string | null
  created_at: string
}

function statusIcon(status: string) {
  if (status === 'failed') return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  return <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
}

function statusLabel(status: string) {
  if (status === 'failed') return 'Classification failed — tap to retry'
  return 'Needs review'
}

export default function DraftReceiptRow({ r }: { r: DraftReceipt }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const label = r.entry_type === 'income'
    ? (r.payer ?? 'Unknown payer')
    : (r.vendor_norm ?? r.vendor_raw ?? 'Unknown vendor')
  const dateStr = r.receipt_date
    ? new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : formatRelative(r.created_at)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete receipt from ${label}?`)) return
    setDeleting(true)
    const res = await fetch(`/api/receipts/${r.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      setDeleting(false)
      alert('Delete failed. Please try again.')
    }
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => router.push(`/receipts/${r.id}/review`)}
    >
      {statusIcon(r.status)}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{statusLabel(r.status)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        {r.total != null && (
          <p className="text-sm font-semibold">${Number(r.total).toFixed(2)}</p>
        )}
        <p className="text-xs text-muted-foreground">{dateStr}</p>
      </div>
      <button
        className="p-1.5 text-muted-foreground hover:text-red-500 flex-shrink-0 transition-colors"
        title="Delete"
        disabled={deleting}
        onClick={handleDelete}
        aria-label="Delete receipt"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}
