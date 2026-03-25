'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Props {
  vehicleId: string
  vehicleLabel: string
}

export default function VehicleRestoreButton({ vehicleId, vehicleLabel }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRestore() {
    setLoading(true)
    setError('')

    const res = await fetch(`/api/vehicles/${vehicleId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'available' }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to restore vehicle')
      setLoading(false)
      return
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" />
        Return to Inventory
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Return This Vehicle to Inventory?</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>{vehicleLabel}</strong> will be moved back to <strong>Available</strong>.
              Sale details from the accidental sold mark will be cleared.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" onClick={handleRestore} disabled={loading}>
              {loading ? 'Restoring...' : 'Yes, Return to Inventory'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
