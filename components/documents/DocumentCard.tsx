'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PropertyDocument } from './types'

interface DocumentCardProps {
  document: PropertyDocument
  onDelete: (id: string) => Promise<void>
  isDeleting: boolean
}

/**
 * Card displaying a property document summary with collapsible bullets.
 * Shows filename, upload date, and expandable summary bullets.
 */
export default function DocumentCard({
  document,
  onDelete,
  isDeleting,
}: DocumentCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const uploadDate = new Date(document.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  // Parse bullets from summary if present
  const bullets = document.summary
    ? document.summary
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
    : []

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(document.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
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

      {/* Summary */}
      {document.summary ? (
        <div>
          {/* Expand/Collapse Button */}
          <button
            id={`summary-${document.id}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label="Show document summary details"
            aria-controls={`summary-content-${document.id}`}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors w-full mb-2"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>Summary</span>
          </button>

          {/* Bullets */}
          {expanded && bullets.length > 0 && (
            <ul id={`summary-content-${document.id}`} className="space-y-2 ml-6">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="text-sm text-foreground leading-relaxed">
                  <span className="inline-block mr-2">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          {/* Fallback text if no bullets parsed */}
          {expanded && bullets.length === 0 && (
            <p id={`summary-content-${document.id}`} className="text-sm text-foreground whitespace-pre-wrap">
              {document.summary}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No summary available
        </p>
      )}
    </div>
  )
}
