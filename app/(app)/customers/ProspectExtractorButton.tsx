'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProspectExtractionModal from '@/components/prospects/ProspectExtractionModal'
import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'
import type { ProspectExtractionResult } from '@/components/prospects/types'

export default function ProspectExtractorButton() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  const handleImportSuccess = async (prospect: ProspectExtractionResult) => {
    try {
      const res = await fetch('/api/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prospect),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error ?? 'Failed to import customer')
      }

      const { customer_id } = await res.json()
      setModalOpen(false)

      // Redirect to the new customer
      router.push(`/customers/${customer_id}`)
    } catch (err) {
      throw err
    }
  }

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        className="gap-1.5"
      >
        <FileDown className="h-4 w-4" />
        Import from Document
      </Button>
      <ProspectExtractionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onImportSuccess={handleImportSuccess}
      />
    </>
  )
}
