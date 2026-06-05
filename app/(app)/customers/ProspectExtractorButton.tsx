'use client'

import { useState } from 'react'
import ProspectExtractionModal from '@/components/prospects/ProspectExtractionModal'
import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'

export default function ProspectExtractorButton() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        className="gap-1.5"
      >
        <FileDown className="h-4 w-4" />
        Import from Document
      </Button>
      {showModal && (
        <ProspectExtractionModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
