'use client'

import { useState } from 'react'
import { FileUp, Loader2, CheckCircle2, AlertCircle, Trash2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import DocumentUploadModal from './DocumentUploadModal'

interface Task {
  id: string
  title: string
  status: 'open' | 'done'
  priority: 'must' | 'should'
  notes?: string | null
}

interface ChecklistDocument {
  id: string
  file_name: string
  verified: boolean
  verified_at: string | null
  extracted_confidence?: string
}

interface ChecklistItemWithDocsProps {
  item: Task
  customerId: string
  documents: ChecklistDocument[]
  onStatusChange: (taskId: string, status: 'open' | 'done') => Promise<void>
  onDocumentAdded: () => void
  onDocumentDelete: (docId: string) => Promise<void>
}

export default function ChecklistItemWithDocs({
  item,
  customerId,
  documents,
  onStatusChange,
  onDocumentAdded,
  onDocumentDelete,
}: ChecklistItemWithDocsProps) {
  const [updating, setUpdating] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)

  const isCompleted = item.status === 'done'
  const isMust = item.priority === 'must'
  const hasDocuments = documents.length > 0
  const allVerified = documents.length > 0 && documents.every(d => d.verified)

  const handleStatusChange = async () => {
    setUpdating(true)
    try {
      const newStatus = isCompleted ? 'open' : 'done'
      await onStatusChange(item.id, newStatus)
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    setDeleteLoading(docId)
    try {
      await onDocumentDelete(docId)
    } finally {
      setDeleteLoading(null)
    }
  }

  return (
    <>
      <div className={`border rounded-lg p-4 space-y-3 ${isCompleted ? 'bg-muted/30 opacity-75' : 'bg-white dark:bg-slate-950'}`}>
        {/* Header with checkbox and title */}
        <div className="flex items-start gap-3">
          <button
            onClick={handleStatusChange}
            disabled={updating}
            className="mt-1 flex-shrink-0 rounded border border-input p-0.5 hover:bg-muted disabled:opacity-50"
          >
            {isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-medium text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                {item.title}
              </p>
              {isMust && (
                <Badge variant="outline" className="text-xs">
                  Required
                </Badge>
              )}
              {allVerified && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950/30">
                  ✓ Verified
                </Badge>
              )}
            </div>
            {item.notes && (
              <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
            )}
          </div>
        </div>

        {/* Documents button and expandable section */}
        <div className="ml-6 flex gap-2">
          {hasDocuments && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocuments(!showDocuments)}
              className="gap-1.5"
            >
              <FileUp className="h-3 w-3" />
              Docs ({documents.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUploadModal(true)}
            disabled={isCompleted}
            className="gap-1.5"
          >
            <FileUp className="h-3 w-3" />
            {hasDocuments ? 'Add' : 'Attach'}
          </Button>
        </div>

        {/* Documents section (collapsed by default) */}
        {showDocuments && hasDocuments && (
          <div className="ml-6 space-y-2 border-t pt-3">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {doc.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  )}
                  <span className="truncate text-xs">{doc.file_name}</span>
                  {doc.verified && (
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      Verified
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteDocument(doc.id)}
                  disabled={deleteLoading === doc.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deleteLoading === doc.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentUploadModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        taskId={item.id}
        customerId={customerId}
        taskTitle={item.title}
        onVerified={onDocumentAdded}
      />
    </>
  )
}
