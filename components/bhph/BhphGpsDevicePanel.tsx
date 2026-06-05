'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MapPin, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  GPS_VENDOR_PRESETS,
  hasGpsDeviceRecorded,
  localTodayYmd,
  type BhphGpsDeviceFields,
} from '@/lib/bhph/gpsDevice'

function formatInstallDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  contractId: string
  initial: BhphGpsDeviceFields
  readOnly?: boolean
}

export default function BhphGpsDevicePanel({ contractId, initial, readOnly }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [vendor, setVendor] = useState(initial.gps_vendor ?? '')
  const [deviceId, setDeviceId] = useState(initial.gps_device_id ?? '')
  const [installedAt, setInstalledAt] = useState(initial.gps_installed_at ?? '')
  const [notes, setNotes] = useState(initial.gps_notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const recorded = hasGpsDeviceRecorded(initial)

  function resetForm() {
    setVendor(initial.gps_vendor ?? '')
    setDeviceId(initial.gps_device_id ?? '')
    setInstalledAt(initial.gps_installed_at ?? '')
    setNotes(initial.gps_notes ?? '')
    setError(null)
  }

  function startEdit() {
    resetForm()
    if (!installedAt) setInstalledAt(localTodayYmd())
    setEditing(true)
  }

  function cancelEdit() {
    resetForm()
    setEditing(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/bhph/${contractId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gps_vendor: vendor || null,
            gps_device_id: deviceId || null,
            gps_installed_at: installedAt || null,
            gps_notes: notes || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Could not save')
          return
        }
        toast.success('GPS device info saved.')
        setEditing(false)
        router.refresh()
      } catch {
        setError('Could not save GPS device info.')
      }
    })
  }

  return (
    <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              GPS device
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Starter-interrupt or tracking unit on this unit
            </p>
          </div>
        </div>
        {!readOnly && !editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {recorded ? 'Edit' : 'Add'}
          </Button>
        )}
      </div>

      {!editing && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Vendor</p>
            <p className="font-medium text-foreground">{initial.gps_vendor?.trim() || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Device ID</p>
            <p className="font-medium text-foreground font-mono text-xs break-all">
              {initial.gps_device_id?.trim() || '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Installed</p>
            <p className="font-medium text-foreground">{formatInstallDate(initial.gps_installed_at)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Notes</p>
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {initial.gps_notes?.trim() || '—'}
            </p>
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="gps-vendor">Vendor</Label>
            <Input
              id="gps-vendor"
              className="h-11"
              placeholder="e.g. PassTime, GPS Trackit"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              list="gps-vendor-presets"
            />
            <datalist id="gps-vendor-presets">
              {GPS_VENDOR_PRESETS.map(v => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gps-device-id">GPS / device ID</Label>
            <Input
              id="gps-device-id"
              className="h-11 font-mono text-sm"
              placeholder="Serial or account #"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gps-installed">Date installed</Label>
            <Input
              id="gps-installed"
              type="date"
              className="h-11"
              value={installedAt}
              onChange={e => setInstalledAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gps-notes">Notes (optional)</Label>
            <Textarea
              id="gps-notes"
              rows={2}
              className="resize-none"
              placeholder="Install location, tech name, removal date, etc."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={pending}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white"
              onClick={save}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
