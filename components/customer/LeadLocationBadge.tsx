'use client'

import { useState } from 'react'
import { MapPin, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export type DealerLocationOption = { id: string; name: string }

interface Props {
  customerId: string
  locationId: string | null
  locationName: string | null
  locations: DealerLocationOption[]
  onLocationSet: (locationId: string, locationName: string) => void
}

export default function LeadLocationBadge({
  customerId,
  locationId,
  locationName,
  locations,
  onLocationSet,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(locationId ?? '')
  const [saving, setSaving] = useState(false)

  if (!locationId) {
    return (
      <Badge
        variant="outline"
        className="text-amber-800 bg-amber-50 border-amber-300 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-800"
      >
        <MapPin className="h-3 w-3 mr-1" />
        No location set
      </Badge>
    )
  }

  async function saveLocation() {
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
        toast.error(data.error ?? 'Failed to update location')
        return
      }
      const name = data.location_name ?? locations.find(l => l.id === selectedId)?.name ?? 'location'
      onLocationSet(selectedId, name)
      toast.success(`Lead assigned to ${name}`)
      setPickerOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedId(locationId)
          setPickerOpen(true)
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <MapPin className="h-3 w-3 text-muted-foreground" />
        {locationName ?? 'Location'}
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change location</DialogTitle>
          </DialogHeader>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
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
          <Button onClick={() => void saveLocation()} disabled={!selectedId || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
