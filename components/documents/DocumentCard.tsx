'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PropertyDocument } from './types'

interface DocumentCardProps {
  document: PropertyDocument
  onDelete: (id: string) => Promise<void>
  isDeleting: boolean
}

/**
 * Card displaying a property document with delete option.
 * Shows filename and upload date only.
 */
export default function DocumentCard({
  document,
  onDelete,
  isDeleting,
}: DocumentCardProps) {
  const [deleting, setDeleting] = useState(false)

  const uploadDate = new Date(document.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(document.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{document.file_name}</p>
          <p className="text-xs text-muted-foreground">{uploadDate}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleDelete()}
          disabled={deleting || isDeleting}
          className="text-destructive hover:text-destructive"
        >
          {deleting || isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
