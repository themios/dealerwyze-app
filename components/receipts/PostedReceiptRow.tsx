'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/utils/relativeTime'

interface PostedReceipt {
  id: string
  vendor_norm: string | null
  vendor_raw: string | null
  total: number | null
  receipt_date: string | null
  created_at: string
}

export default function PostedReceiptRow({ r }: { r: PostedReceipt }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const label = r.vendor_norm ?? r.vendor_raw ?? 'Unknown vendor'
  const dateStr = r.receipt_date
    ? new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : formatRelative(r.created_at)

  async function handleDelete() {
    if (!confirm(`Delete receipt from ${label}? This will also remove the ledger entry.`)) return
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
    <div className="flex items-center gap-3 px-4 py-3">
      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{dateStr}</p>
      </div>
      {r.total != null && (
        <p className="text-sm font-semibold flex-shrink-0">${Number(r.total).toFixed(2)}</p>
      )}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Edit receipt"
          onClick={() => router.push(`/receipts/${r.id}/review`)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-red-500"
          title="Delete receipt"
          disabled={deleting}
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
