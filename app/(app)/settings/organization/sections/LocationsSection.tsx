'use client'

import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, MapPin, X, Pencil } from 'lucide-react'

interface DealerLocation {
  id: string
  name: string
  address: string
  phone: string
  is_primary: boolean
}

export default function LocationsSection() {
  const [locations, setLocations]               = useState<DealerLocation[]>([])
  const [addLocOpen, setAddLocOpen]             = useState(false)
  const [newLoc, setNewLoc]                     = useState<Omit<DealerLocation, 'id'>>({ name: '', address: '', phone: '', is_primary: false })
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocDraft, setEditLocDraft]         = useState<DealerLocation | null>(null)
  const [saving, setSaving]                     = useState(false)
  const [saved, setSaved]                       = useState(false)
  const [saveError, setSaveError]               = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/org')
      .then(r => r.json())
      .then(d => {
        setLocations(Array.isArray(d.locations) ? d.locations : [])
      })
  }, [])

  function addLocation() {
    if (!newLoc.name || !newLoc.address) return
    const loc: DealerLocation = { ...newLoc, id: crypto.randomUUID() }
    const updated = newLoc.is_primary
      ? locations.map(l => ({ ...l, is_primary: false })).concat(loc)
      : [...locations, loc]
    setLocations(updated)
    setNewLoc({ name: '', address: '', phone: '', is_primary: false })
    setAddLocOpen(false)
    setSaved(false)
  }

  function removeLocation(id: string) {
    setLocations(prev => prev.filter(l => l.id !== id))
    if (editingLocationId === id) {
      setEditingLocationId(null)
      setEditLocDraft(null)
    }
    setSaved(false)
  }

  function startEditLocation(loc: DealerLocation) {
    setEditingLocationId(loc.id)
    setEditLocDraft({ ...loc })
  }

  function saveEditLocation() {
    if (!editLocDraft || editLocDraft.name.trim() === '' || editLocDraft.address.trim() === '') return
    setLocations(prev => {
      const next = prev.map(l => (l.id === editLocDraft.id ? editLocDraft : l))
      if (editLocDraft.is_primary) {
        return next.map(l => (l.id === editLocDraft.id ? { ...l, is_primary: true } : { ...l, is_primary: false }))
      }
      return next
    })
    setEditingLocationId(null)
    setEditLocDraft(null)
    setSaved(false)
  }

  function cancelEditLocation() {
    setEditingLocationId(null)
    setEditLocDraft(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ locations }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pt-2 border-t">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Locations</p>
        <Button variant="outline" size="sm" onClick={() => setAddLocOpen(p => !p)} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {addLocOpen && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2 mb-3">
          <Input placeholder="Location Name (e.g. Main Lot)" value={newLoc.name} onChange={e => setNewLoc(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
          <Input placeholder="Address" value={newLoc.address} onChange={e => setNewLoc(p => ({ ...p, address: e.target.value }))} className="h-9 text-sm" />
          <Input placeholder="Phone (optional)" value={newLoc.phone} onChange={e => setNewLoc(p => ({ ...p, phone: e.target.value }))} className="h-9 text-sm" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={newLoc.is_primary} onChange={e => setNewLoc(p => ({ ...p, is_primary: e.target.checked }))} className="rounded" />
            Set as primary location
          </label>
          <Button size="sm" onClick={addLocation} className="w-full">Add Location</Button>
        </div>
      )}

      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc.id} className="flex items-start justify-between p-3 rounded-lg border bg-card gap-2">
            {editingLocationId === loc.id && editLocDraft?.id === loc.id ? (
              <div className="flex-1 space-y-2 min-w-0">
                <Input
                  placeholder="Location Name"
                  value={editLocDraft.name}
                  onChange={e => setEditLocDraft(d => d ? { ...d, name: e.target.value } : null)}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Address"
                  value={editLocDraft.address}
                  onChange={e => setEditLocDraft(d => d ? { ...d, address: e.target.value } : null)}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Phone (optional)"
                  value={editLocDraft.phone}
                  onChange={e => setEditLocDraft(d => d ? { ...d, phone: e.target.value } : null)}
                  className="h-9 text-sm"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editLocDraft.is_primary}
                    onChange={e => setEditLocDraft(d => d ? { ...d, is_primary: e.target.checked } : null)}
                    className="rounded"
                  />
                  Set as primary location
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={cancelEditLocation}>Cancel</Button>
                  <Button size="sm" onClick={saveEditLocation} disabled={!editLocDraft.name.trim() || !editLocDraft.address.trim()}>Save</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium truncate">{loc.name}</p>
                    {loc.is_primary && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Primary</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-5">{loc.address}</p>
                  {loc.phone && <p className="text-xs text-muted-foreground ml-5">{loc.phone}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEditLocation(loc)} className="p-1.5 text-muted-foreground hover:text-foreground rounded" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeLocation(loc.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded" title="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {locations.length === 0 && (
          <p className="text-xs text-muted-foreground">No locations added yet.</p>
        )}
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Locations'}
      </Button>
    </div>
  )
}
