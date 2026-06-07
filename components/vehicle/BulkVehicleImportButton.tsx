'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import BulkVehicleImportModal from './BulkVehicleImportModal'

export default function BulkVehicleImportButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Upload className="h-4 w-4" />
        Bulk Import
      </Button>
      <BulkVehicleImportModal open={open} onOpenChange={setOpen} />
    </>
  )
}
