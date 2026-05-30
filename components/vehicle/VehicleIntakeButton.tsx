'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VehicleIntakeSheet from './VehicleIntakeSheet'
import { useVertical } from '@/hooks/useVertical'

export default function VehicleIntakeButton() {
  const [open, setOpen] = useState(false)
  const { vertical } = useVertical()
  const router = useRouter()

  // RE orgs go directly to the listing form page (no barcode/scan intake needed)
  if (vertical === 'real_estate') {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-white/70 hover:text-white gap-1"
        onClick={() => router.push('/vehicles/new')}
      >
        <Plus className="h-5 w-5" />
        Add Listing
      </Button>
    )
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-white/70 hover:text-white gap-1"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-5 w-5" />
        Add Inv
      </Button>
      <VehicleIntakeSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
