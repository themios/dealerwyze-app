'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { DealerLocationOption } from '@/components/customer/LeadLocationBadge'

interface Props {
  open: boolean
  customerId: string
  locations: DealerLocationOption[]
  onLocationSet: (locationId: string, locationName: string) => void
}

// Renders as an inline banner — does NOT use a fixed overlay so that notes,
// activity history, and parsed lead content remain scrollable and readable
// beneath it. Only assignment and outreach actions are gated server-side.
export default function LeadLocationBlockingModal({
  open,
  customerId,
  locations,
  onLocationSet,
}: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleAssign() {
    if (!selectedId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: selectedId }),
      })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        location_name?: string
      }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to assign location')
        return
      }
      const name = data.location_name ?? locations.find(l => l.id === selectedId)?.name ?? 'location'
      onLocationSet(selectedId, name)
      toast.success(`Lead assigned to ${name}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="alert"
      aria-label="Location assignment required"
      className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 rounded-lg px-4 py-3 mb-4 mx-4 mt-4"
    >
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Assign a location to continue
      </p>
      <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">
        This lead must be linked to a store before assignment and outreach can begin. Select the location this customer contacted. Notes and activity history are still readable below.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {locations.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => void handleAssign()}
          disabled={!selectedId || saving}
        >
          {saving ? 'Saving…' : 'Assign'}
        </Button>
      </div>
    </div>
  )
}
