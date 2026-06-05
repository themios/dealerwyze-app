'use client'

import { useState, useEffect } from 'react'
import DocumentList from '@/components/documents/DocumentList'
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'
import PricingAnalysisButton from '@/components/pricing/PricingAnalysisButton'
import PricingAnalysisModal from '@/components/pricing/PricingAnalysisModal'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'
import type { PropertyDocument } from '@/components/documents/types'

interface Props {
  listingId: string
}

export default function ListingDetailsPanel({ listingId }: Props) {
  const [showDocUpload, setShowDocUpload] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)

  // Fetch documents on mount
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await fetch(`/api/documents?property_id=${listingId}`)
        if (!res.ok) {
          setDocuments([])
          return
        }
        const data = await res.json()
        setDocuments(Array.isArray(data) ? data : data.documents ?? [])
      } catch {
        setDocuments([])
      } finally {
        setIsLoadingDocs(false)
      }
    }

    fetchDocuments()
  }, [listingId])

  return (
    <>
      {/* Documents Section */}
      <div className="mb-6 border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Documents</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDocUpload(true)}
            className="gap-1.5"
          >
            <FileUp className="h-3.5 w-3.5" />
            Upload
          </Button>
        </div>
        {!isLoadingDocs && (
          <DocumentList
            documents={documents}
            onDocumentsChange={setDocuments}
          />
        )}
        <DocumentUploadModal
          propertyId={listingId}
          open={showDocUpload}
          onOpenChange={setShowDocUpload}
          onUploadSuccess={(doc) => {
            setDocuments([...documents, doc])
          }}
        />
      </div>

      {/* Pricing Analysis Section */}
      <div className="mb-6 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Pricing Analysis</h2>
        <PricingAnalysisButton
          onClick={() => setShowPricingModal(true)}
        />
        <PricingAnalysisModal
          open={showPricingModal}
          onOpenChange={setShowPricingModal}
          propertyId={listingId}
        />
      </div>
    </>
  )
}
