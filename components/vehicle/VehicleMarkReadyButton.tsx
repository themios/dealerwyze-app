'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Props {
  vehicleId: string
  vehicleLabel: string
}

export default function VehicleMarkReadyButton({ vehicleId, vehicleLabel }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [blockingItems, setBlockingItems] = useState<string[]>([])

  async function handlePromote() {
    setLoading(true)
    setBlockingItems([])
    const res = await fetch(`/api/vehicles/${vehicleId}/recon/promote`, { method: 'POST' })
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      const data = await res.json()
      if (res.status === 409 && data.blocking_items) {
        setBlockingItems(data.blocking_items)
      }
    }
    setLoading(false)
  }

  return (
    <>
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
        onClick={() => { setBlockingItems([]); setOpen(true) }}
      >
        <CheckCircle className="h-4 w-4" />
        Mark Ready
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Move to Available Inventory?</SheetTitle>
          </SheetHeader>

          {blockingItems.length > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Required items not done yet:</p>
                  <ul className="mt-1 space-y-0.5">
                    {blockingItems.map(label => (
                      <li key={label} className="text-sm text-amber-700 dark:text-amber-500">- {label}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                Go back and finish checklist
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>{vehicleLabel}</strong> will move to your available inventory. Make sure you have set a list price before promoting.
              </p>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={handlePromote}
                disabled={loading}
              >
                {loading ? 'Moving...' : 'Move to Available'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
