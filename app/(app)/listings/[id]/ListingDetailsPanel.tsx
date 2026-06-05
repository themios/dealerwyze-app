'use client'

import { useState } from 'react'
import DocumentList from '@/components/documents/DocumentList'
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'
import PricingAnalysisButton from '@/components/pricing/PricingAnalysisButton'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'

interface Props {
  listingId: string
}

export default function ListingDetailsPanel({ listingId }: Props) {
  const [showDocUpload, setShowDocUpload] = useState(false)

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
        <DocumentList propertyId={listingId} />
        {showDocUpload && (
          <DocumentUploadModal
            propertyId={listingId}
            onClose={() => setShowDocUpload(false)}
          />
        )}
      </div>

      {/* Pricing Analysis Section */}
      <div className="mb-6 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Pricing Analysis</h2>
        <PricingAnalysisButton listingId={listingId} />
      </div>
    </>
  )
}
