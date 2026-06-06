'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MapPin, Plus } from 'lucide-react'
import type { SettingsLocationRow } from '@/lib/settings/locationsTypes'

type StaffMember = { id: string; display_name: string; role: string }

type LocationsPayload = {
  locations: SettingsLocationRow[]
  unassigned_reps: StaffMember[]
}

type LocationDraft = {
  name: string
  address: string
  phone: string
  inventory_url: string
  short_code: string
  is_active: boolean
}

function toDraft(loc: SettingsLocationRow): LocationDraft {
  return {
    name: loc.name,
    address: loc.address ?? '',
    phone: loc.phone ?? '',
    inventory_url: loc.inventory_url ?? '',
    short_code: loc.short_code ?? '',
    is_active: loc.is_active,
  }
}

function LocationCard({
  location,
  unassignedReps,
  onUpdated,
  onStaffChange,
}: {
  location: SettingsLocationRow
  unassignedReps: StaffMember[]
  onUpdated: (loc: SettingsLocationRow) => void
  onStaffChange: (locationId: string, staff: StaffMember[], unassigned: StaffMember[]) => void
}) {
  const [draft, setDraft] = useState<LocationDraft>(() => toDraft(location))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [assignRepId, setAssignRepId] = useState('')
  const [staffActing, setStaffActing] = useState<string | null>(null)

  useEffect(() => {
    setDraft(toDraft(location))
  }, [location])

  async function handleSave() {
    if (!draft.name.trim()) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const data = await apiFetch<{ location: SettingsLocationRow }>(
        `/api/settings/locations/${location.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            address: draft.address,
            phone: draft.phone,
            inventory_url: draft.inventory_url,
            short_code: draft.short_code || null,
            is_active: draft.is_active,
          }),
        },
      )
      onUpdated(data.location)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleStaffAction(profileId: string, action: 'assign' | 'remove') {
    setStaffActing(profileId + action)
    try {
      const data = await apiFetch<{ staff: StaffMember[] }>(
        `/api/settings/locations/${location.id}/staff`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profileId, action }),
        },
      )
      const removed = location.staff.find(s => s.id === profileId)
      const nextUnassigned =
        action === 'remove' && removed
          ? [...unassignedReps, removed]
          : unassignedReps.filter(r => r.id !== profileId)
      onStaffChange(location.id, data.staff, nextUnassigned)
      setAssignRepId('')
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Staff update failed')
    } finally {
      setStaffActing(null)
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-4 ${location.is_active ? 'bg-card' : 'bg-muted/30 opacity-90'}`}
    >
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm font-semibold flex-1 truncate">{location.name}</p>
        {!location.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`loc-name-${location.id}`}>Name</Label>
          <Input
            id={`loc-name-${location.id}`}
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`loc-addr-${location.id}`}>Address</Label>
          <Input
            id={`loc-addr-${location.id}`}
            value={draft.address}
            onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`loc-phone-${location.id}`}>Phone</Label>
          <Input
            id={`loc-phone-${location.id}`}
            value={draft.phone}
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`loc-inv-${location.id}`}>Inventory URL</Label>
          <Input
            id={`loc-inv-${location.id}`}
            value={draft.inventory_url}
            onChange={e => setDraft(d => ({ ...d, inventory_url: e.target.value }))}
            placeholder="https://…"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`loc-code-${location.id}`}>Location Code (8 chars max)</Label>
          <Input
            id={`loc-code-${location.id}`}
            value={draft.short_code}
            onChange={e => setDraft(d => ({ ...d, short_code: e.target.value.slice(0, 8) }))}
            placeholder="e.g., EM or Simi Val"
            maxLength={8}
            className="h-9 text-sm"
          />
          <p className="text-xs text-muted-foreground">Used in lead cards when you have multiple locations</p>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`loc-active-${location.id}`}>Active</Label>
          <Switch
            id={`loc-active-${location.id}`}
            checked={draft.is_active}
            onCheckedChange={checked => setDraft(d => ({ ...d, is_active: checked }))}
          />
        </div>
      </div>

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned staff</p>
        {location.staff.length === 0 ? (
          <p className="text-xs text-muted-foreground">No reps assigned to this location.</p>
        ) : (
          <ul className="space-y-1">
            {location.staff.map(member => (
              <li key={member.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{member.display_name}</span>
                <button
                  type="button"
                  onClick={() => void handleStaffAction(member.id, 'remove')}
                  disabled={staffActing !== null}
                  className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {unassignedReps.length > 0 && (
          <div className="flex gap-2 items-end pt-1">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Assign staff</Label>
              <Select value={assignRepId} onValueChange={setAssignRepId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select rep" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedReps.map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!assignRepId || staffActing !== null}
              onClick={() => void handleStaffAction(assignRepId, 'assign')}
            >
              Assign
            </Button>
          </div>
        )}
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <Button size="sm" onClick={() => void handleSave()} disabled={saving || !draft.name.trim()}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
      </Button>
    </div>
  )
}

export default function LocationsManager() {
  const [locations, setLocations] = useState<SettingsLocationRow[]>([])
  const [unassignedReps, setUnassignedReps] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newLoc, setNewLoc] = useState({ name: '', address: '', phone: '', inventory_url: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch<LocationsPayload>('/api/settings/locations')
      setLocations(data.locations)
      setUnassignedReps(data.unassigned_reps)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load locations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function handleLocationUpdated(updated: SettingsLocationRow) {
    setLocations(prev => prev.map(l => (l.id === updated.id ? updated : l)))
  }

  function handleStaffChange(
    locationId: string,
    staff: StaffMember[],
    nextUnassigned: StaffMember[],
  ) {
    setLocations(prev =>
      prev.map(l => (l.id === locationId ? { ...l, staff } : l)),
    )
    setUnassignedReps(nextUnassigned)
    void load()
  }

  async function handleAddLocation() {
    if (!newLoc.name.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const data = await apiFetch<{ location: SettingsLocationRow }>('/api/settings/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoc),
      })
      setLocations(prev => [...prev, data.location])
      setNewLoc({ name: '', address: '', phone: '', inventory_url: '' })
      setAddOpen(false)
      void load()
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not add location')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading locations…</p>
  }

  if (loadError) {
    return <p className="text-sm text-destructive py-4">{loadError}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Manage store locations, outbound identity, and which sales reps belong to each lot.
        </p>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(p => !p)} className="gap-1 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add location
        </Button>
      </div>

      {addOpen && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-medium">New location</p>
          <Input
            placeholder="Location name (required)"
            value={newLoc.name}
            onChange={e => setNewLoc(p => ({ ...p, name: e.target.value }))}
            className="h-9 text-sm"
          />
          <Input
            placeholder="Address"
            value={newLoc.address}
            onChange={e => setNewLoc(p => ({ ...p, address: e.target.value }))}
            className="h-9 text-sm"
          />
          <Input
            placeholder="Phone"
            value={newLoc.phone}
            onChange={e => setNewLoc(p => ({ ...p, phone: e.target.value }))}
            className="h-9 text-sm"
          />
          <Input
            placeholder="Inventory URL"
            value={newLoc.inventory_url}
            onChange={e => setNewLoc(p => ({ ...p, inventory_url: e.target.value }))}
            className="h-9 text-sm"
          />
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <Button
            size="sm"
            className="w-full"
            disabled={adding || !newLoc.name.trim()}
            onClick={() => void handleAddLocation()}
          >
            {adding ? 'Saving…' : 'Save location'}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {locations.map(loc => (
          <LocationCard
            key={loc.id}
            location={loc}
            unassignedReps={unassignedReps}
            onUpdated={handleLocationUpdated}
            onStaffChange={handleStaffChange}
          />
        ))}
        {locations.length === 0 && (
          <p className="text-sm text-muted-foreground">No locations yet. Add your first store.</p>
        )}
      </div>
    </div>
  )
}
