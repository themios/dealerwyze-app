'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Loader2, AlertCircle, FileText, Image as ImageIcon, Type } from 'lucide-react'
import ExtractionResultModal from './ExtractionResultModal'
import type { ProspectExtractionResult, ExtractionMethod } from './types'

interface ProspectExtractionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportSuccess?: (prospect: ProspectExtractionResult) => void
}

/**
 * Master modal with 3 tabs for RE prospect extraction:
 * 1. Text paste (textarea with submit)
 * 2. Image upload (screenshot)
 * 3. PDF upload (email or document)
 */
export default function ProspectExtractionModal({
  open,
  onOpenChange,
  onImportSuccess,
}: ProspectExtractionModalProps) {
  const [activeTab, setActiveTab] = useState<ExtractionMethod>('text')
  const [pastedText, setPastedText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProspectExtractionResult | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleTextSubmit = async () => {
    if (!pastedText.trim()) {
      setError('Please paste some text')
      return
    }

    setExtracting(true)
    setError(null)

    try {
      const res = await fetch('/api/prospects/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'text',
          text: pastedText,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error ?? 'Extraction failed')
      }

      const extractionResult = (await res.json()) as ProspectExtractionResult
      setResult(extractionResult)
      setShowResult(true)
      setPastedText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleFileSelect = (file: File | null) => {
    setError(null)

    if (!file) {
      setSelectedFile(null)
      return
    }

    const method = activeTab as ExtractionMethod
    const isImage = method === 'image' && file.type.startsWith('image/')
    const isPdf = method === 'pdf' && file.type === 'application/pdf'

    if (method === 'image' && !isImage) {
      setError('Please select an image file (JPEG, PNG, WebP)')
      return
    }

    if (method === 'pdf' && !isPdf) {
      setError('Please select a PDF file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)')
      return
    }

    setSelectedFile(file)
  }

  const handleFileUpload = async () => {
    if (!selectedFile) return

    setExtracting(true)
    setError(null)

    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

          if (!base64) {
            throw new Error('Failed to read file')
          }

          const res = await fetch('/api/prospects/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: activeTab,
              mime_type: selectedFile.type,
              file_base64: base64,
            }),
          })

          if (!res.ok) {
            const errorData = await res.json()
            throw new Error(errorData.error ?? 'Extraction failed')
          }

          const extractionResult = (await res.json()) as ProspectExtractionResult
          setResult(extractionResult)
          setShowResult(true)
          setSelectedFile(null)
          setExtracting(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Extraction failed')
          setExtracting(false)
        }
      }

      reader.onerror = () => {
        setError('Failed to read file')
        setExtracting(false)
      }

      reader.readAsDataURL(selectedFile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setExtracting(false)
    }
  }

  const handleImportSuccess = async (prospect: ProspectExtractionResult) => {
    setPastedText('')
    setSelectedFile(null)
    setResult(null)
    setShowResult(false)
    setError(null)
    onOpenChange(false)
    onImportSuccess?.(prospect)
  }

  return (
    <>
      <Dialog open={open && !showResult} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Extract Prospect Information</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Choose how to provide prospect data: paste text, upload a screenshot, or attach a PDF
            </p>
          </DialogHeader>

          {/* Tab Navigation */}
          <div role="tablist" className="grid w-full grid-cols-3 gap-2 mb-4 p-1 bg-muted rounded-lg">
            {(['text', 'image', 'pdf'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`${tab}-panel`}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'text' && <Type className="h-4 w-4" />}
                {tab === 'image' && <ImageIcon className="h-4 w-4" />}
                {tab === 'pdf' && <FileText className="h-4 w-4" />}
                <span className="hidden sm:inline capitalize">{tab}</span>
              </button>
            ))}
          </div>

            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg mt-4">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Text Paste Tab */}
            {activeTab === 'text' && (
            <div id="text-panel" role="tabpanel" aria-labelledby="text-tab" className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Paste prospect information</label>
                <Textarea
                  placeholder="Paste email, form submission, text notes, or referral info here..."
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  disabled={extracting}
                  className="min-h-32"
                />
              </div>
              <Button
                onClick={handleTextSubmit}
                disabled={!pastedText.trim() || extracting}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract Information'
                )}
              </Button>
            </div>
            )}

            {/* Image Upload Tab */}
            {activeTab === 'image' && (
            <div id="image-panel" role="tabpanel" aria-labelledby="image-tab" className="space-y-4 mt-4">
              <div
                onClick={() => document.getElementById('image-input')?.click()}
                className="border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/30 transition-colors text-center"
              >
                <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Click to select or drag image</p>
                <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP</p>
              </div>
              <input
                id="image-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              {selectedFile && (
                <div className="p-3 bg-muted rounded-lg flex items-center justify-between">
                  <span className="text-sm truncate">{selectedFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    ×
                  </Button>
                </div>
              )}

              <Button
                onClick={handleFileUpload}
                disabled={!selectedFile || extracting}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Screenshot
                  </>
                )}
              </Button>
            </div>
            )}

            {/* PDF Upload Tab */}
            {activeTab === 'pdf' && (
            <div id="pdf-panel" role="tabpanel" aria-labelledby="pdf-tab" className="space-y-4 mt-4">
              <div
                onClick={() => document.getElementById('pdf-input')?.click()}
                className="border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/30 transition-colors text-center"
              >
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Click to select or drag PDF</p>
                <p className="text-xs text-muted-foreground">Email or document PDF</p>
              </div>
              <input
                id="pdf-input"
                type="file"
                accept="application/pdf"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              {selectedFile && (
                <div className="p-3 bg-muted rounded-lg flex items-center justify-between">
                  <span className="text-sm truncate">{selectedFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    ×
                  </Button>
                </div>
              )}

              <Button
                onClick={handleFileUpload}
                disabled={!selectedFile || extracting}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload PDF
                  </>
                )}
              </Button>
            </div>
            )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={extracting}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Result Modal */}
      {showResult && (
        <ExtractionResultModal
          open={showResult}
          onOpenChange={v => {
            setShowResult(v)
            if (!v) onOpenChange(false)
          }}
          result={result}
          loading={extracting}
          onImport={() => handleImportSuccess(result!)}
          onMerge={() => handleImportSuccess(result!)}
        />
      )}
    </>
  )
}
