'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VehicleIntakeSheet from './VehicleIntakeSheet'

export default function VehicleIntakeButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        title="Add vehicle"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-5 w-5" />
      </Button>
      <VehicleIntakeSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
