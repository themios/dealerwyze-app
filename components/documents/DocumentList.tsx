'use client'

import { useState, useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import DocumentCard from './DocumentCard'
import type { PropertyDocument } from './types'

interface DocumentListProps {
  documents: PropertyDocument[]
  onDocumentsChange: (docs: PropertyDocument[]) => void
}

/**
 * List of property documents with delete capability.
 * Shows empty state when no documents exist.
 * Displays errors inline when delete fails.
 */
export default function DocumentList({
  documents,
  onDocumentsChange,
}: DocumentListProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (docId: string) => {
      setIsDeleting(true)
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method: 'DELETE',
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error ?? 'Failed to delete document')
        }

        // Remove from local list
        const updated = documents.filter(d => d.id !== docId)
        onDocumentsChange(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed'
        console.error('[DocumentList] delete error:', msg)
        // Display error toast to user
        setError(`Failed to delete document: ${msg}`)
        // Auto-clear after 5 seconds
        setTimeout(() => setError(null), 5000)
      } finally {
        setIsDeleting(false)
      }
    },
    [documents, onDocumentsChange]
  )

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No documents uploaded yet. Add inspection reports, appraisals, or disclosure documents.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Error Toast */}
      {error && (
        <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Document Cards */}
      {documents.map(doc => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  )
}
