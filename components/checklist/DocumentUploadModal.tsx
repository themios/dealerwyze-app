'use client'

import { useState } from 'react'
import { Upload, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface ExtractedData {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  id_number: string | null
  id_type: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  confidence: 'high' | 'medium' | 'low'
}

interface DocumentUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  customerId: string
  taskTitle: string
  onVerified: () => void
}

export default function DocumentUploadModal({
  open,
  onOpenChange,
  taskId,
  customerId,
  taskTitle,
  onVerified,
}: DocumentUploadModalProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifiedData, setVerifiedData] = useState<Partial<ExtractedData>>({})
  const [verifyNotes, setVerifyNotes] = useState('')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

    if (!allowedMimes.includes(file.type)) {
      setError('Unsupported file type. Use JPEG, PNG, WebP, or PDF.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB.')
      return
    }

    setSelectedFile(file)
  }

  const handleExtract = async () => {
    if (!selectedFile) return

    setExtracting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('task_id', taskId)

      const res = await fetch('/api/checklist-documents/extract', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error ?? 'Extraction failed')
      }

      const { document_id, extracted_data } = await res.json()
      setDocumentId(document_id)
      setExtractedData(extracted_data)
      setVerifiedData({ ...extracted_data })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleVerify = async () => {
    if (!documentId || !extractedData) return

    setVerifying(true)
    setError(null)

    try {
      const res = await fetch('/api/checklist-documents/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          customer_id: customerId,
          verified_data: verifiedData,
          notes: verifyNotes || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error ?? 'Verification failed')
      }

      onVerified()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const resetState = () => {
    setSelectedFile(null)
    setExtractedData(null)
    setDocumentId(null)
    setVerifiedData({})
    setVerifyNotes('')
    setError(null)
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  const confidenceColor: Record<string, string> = {
    high: 'text-green-600',
    medium: 'text-amber-600',
    low: 'text-red-600',
  }

  const formContent = (
    <>
      {!extractedData ? (
        // Upload & Extract Phase
        <div className="space-y-4">
          {error && (
            <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div
            onClick={() => document.getElementById('file-input')?.click()}
            className="border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/30 transition-colors text-center"
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Click to select or drag file</p>
            <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, or PDF (max 5MB)</p>
          </div>

          <input
            id="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
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
            onClick={handleExtract}
            disabled={!selectedFile || extracting}
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
      ) : (
        // Verification Phase
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/30">
            <CheckCircle2 className={`h-4 w-4 ${confidenceColor[extractedData.confidence]}`} />
            <p className="text-sm">
              <strong>Confidence: {extractedData.confidence}</strong> — Review and verify the extracted information below.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name" className="text-xs">First Name</Label>
              <Input
                id="first_name"
                value={verifiedData.first_name ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, first_name: e.target.value || null })}
                placeholder={extractedData.first_name || 'Not extracted'}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="last_name" className="text-xs">Last Name</Label>
              <Input
                id="last_name"
                value={verifiedData.last_name ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, last_name: e.target.value || null })}
                placeholder={extractedData.last_name || 'Not extracted'}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-xs">Phone</Label>
              <Input
                id="phone"
                value={verifiedData.phone ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, phone: e.target.value || null })}
                placeholder={extractedData.phone || 'Not extracted'}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dob" className="text-xs">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={verifiedData.date_of_birth ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, date_of_birth: e.target.value || null })}
                placeholder={extractedData.date_of_birth || 'Not extracted'}
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="address" className="text-xs">Address</Label>
              <Input
                id="address"
                value={verifiedData.address_line_1 ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, address_line_1: e.target.value || null })}
                placeholder={extractedData.address_line_1 || 'Not extracted'}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="city" className="text-xs">City</Label>
              <Input
                id="city"
                value={verifiedData.city ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, city: e.target.value || null })}
                placeholder={extractedData.city || 'Not extracted'}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="state" className="text-xs">State</Label>
              <Input
                id="state"
                value={verifiedData.state ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, state: e.target.value?.toUpperCase() || null })}
                placeholder={extractedData.state || 'Not extracted'}
                maxLength={2}
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="zip" className="text-xs">ZIP Code</Label>
              <Input
                id="zip"
                value={verifiedData.zip ?? ''}
                onChange={e => setVerifiedData({ ...verifiedData, zip: e.target.value || null })}
                placeholder={extractedData.zip || 'Not extracted'}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes" className="text-xs">Verification Notes</Label>
            <Textarea
              id="notes"
              value={verifyNotes}
              onChange={e => setVerifyNotes(e.target.value)}
              placeholder="e.g., Old address shown on ID, corrected to current address"
              className="mt-1 min-h-20"
            />
          </div>

          {error && (
            <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={verifying}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setExtractedData(null)
                setSelectedFile(null)
              }}
              variant="outline"
              disabled={verifying}
            >
              Upload Different File
            </Button>
            <Button onClick={handleVerify} disabled={verifying}>
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Update Contact'
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )

  // On mobile/tablet, use Sheet; on desktop, use Dialog for more space
  if (!isDesktop) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="max-h-[90vh] overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Upload Document</SheetTitle>
            <SheetDescription>{taskTitle}</SheetDescription>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: use Dialog for better layout
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>{taskTitle}</DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
