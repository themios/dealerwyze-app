'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SUPPORTED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from './types'
import type { PropertyDocument } from './types'

interface DocumentUploadModalProps {
  propertyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadSuccess: (document: PropertyDocument) => void
}

/**
 * Modal for uploading property documents (inspection reports, appraisals, etc.)
 * Supports JPEG, PNG, WebP, and PDF formats.
 * Shows progress indicator while document is being analyzed.
 */
export default function DocumentUploadModal({
  propertyId,
  open,
  onOpenChange,
  onUploadSuccess,
}: DocumentUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const supportedExtensions = Array.from(SUPPORTED_DOCUMENT_TYPES)
    .map(mime => {
      if (mime === 'image/jpeg') return '.jpg, .jpeg'
      if (mime === 'image/png') return '.png'
      if (mime === 'image/webp') return '.webp'
      if (mime === 'application/pdf') return '.pdf'
      return ''
    })
    .filter(Boolean)
    .join(', ')

  const handleFileSelect = (file: File | null) => {
    setError(null)
    setProgress(0)

    if (!file) {
      setSelectedFile(null)
      return
    }

    // Validate file type
    if (!SUPPORTED_DOCUMENT_TYPES.has(file.type)) {
      setError(
        `Unsupported file type. Supported: ${supportedExtensions}`
      )
      return
    }

    // Validate file size
    if (file.size > MAX_DOCUMENT_SIZE) {
      setError(
        `File too large. Maximum size: ${(MAX_DOCUMENT_SIZE / 1024 / 1024).toFixed(0)}MB`
      )
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      // Convert file to base64
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1]

          // Simulate progress
          setProgress(30)

          const res = await fetch('/api/documents/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: propertyId,
              filename: selectedFile.name,
              mime_type: selectedFile.type,
              file_base64: base64,
            }),
          })

          setProgress(70)

          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.error ?? 'Upload failed')
          }

          const document = (await res.json()) as PropertyDocument

          setProgress(100)

          // Reset and close
          setTimeout(() => {
            setSelectedFile(null)
            setProgress(0)
            onOpenChange(false)
            onUploadSuccess(document)
          }, 500)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Upload failed'
          )
          setUploading(false)
        }
      }

      reader.readAsDataURL(selectedFile)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed'
      )
      setUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Property Document</DialogTitle>
        </DialogHeader>

        {/* Uploading State */}
        {uploading && (
          <div className="space-y-4 py-6">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium text-sm">Analyzing document...</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(progress)}%
                </p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* File Selection */}
        {!uploading && (
          <div className="space-y-4 py-6">
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-center space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-sm font-medium">
                    {selectedFile
                      ? selectedFile.name
                      : 'Click to select or drag and drop'}
                  </p>
                  {!selectedFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {supportedExtensions}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={Array.from(SUPPORTED_DOCUMENT_TYPES).join(',')}
              onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            {/* Selected File Info */}
            {selectedFile && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm truncate">{selectedFile.name}</span>
                <button
                  onClick={() => handleFileSelect(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!uploading && (
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFile(null)
                setError(null)
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
