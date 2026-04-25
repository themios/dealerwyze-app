'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExternalLink } from 'lucide-react'

export default function GoogleBusinessProfileSection() {
  const [gbpLocationId, setGbpLocationId] = useState('')
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)

  useEffect(() => {
    fetch('/api/settings/org')
      .then(r => r.json())
      .then(d => setGbpLocationId(d.gbp_location_id ?? ''))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ gbp_location_id: gbpLocationId }),
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="px-4 pt-2 border-t">
      <p className="text-sm font-semibold mb-3">Google Business Profile</p>
      <div className="space-y-1.5">
        <Label htmlFor="gbp-location-id" className="text-sm font-medium">GBP Location ID</Label>
        <Input
          id="gbp-location-id" type="text"
          value={gbpLocationId}
          onChange={e => { setGbpLocationId(e.target.value); setSaved(false) }}
          placeholder="locations/1234567890"
        />
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          Find this in your Google Business Profile URL.
          <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
            Open GBP <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
      <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
      </Button>
    </div>
  )
}
