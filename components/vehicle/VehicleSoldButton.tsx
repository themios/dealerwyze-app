'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DollarSign } from 'lucide-react'
import MarkSoldSheet from './MarkSoldSheet'

interface Props {
  vehicleId: string
  vehicleLabel: string
}

export default function VehicleSoldButton({ vehicleId, vehicleLabel }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <DollarSign className="h-4 w-4" />
      </Button>
      <MarkSoldSheet
        vehicleId={vehicleId}
        vehicleLabel={vehicleLabel}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
