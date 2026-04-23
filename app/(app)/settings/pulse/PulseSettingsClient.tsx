// app/(app)/settings/pulse/PulseSettingsClient.tsx
'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface PulseSettings {
  pulse_enabled: boolean
  pulse_auto_send_on_sold: boolean
  pulse_send_day30: boolean
  pulse_send_day180: boolean
}

export default function PulseSettingsClient() {
  const [settings, setSettings] = useState<PulseSettings>({
    pulse_enabled: false, pulse_auto_send_on_sold: true,
    pulse_send_day30: true, pulse_send_day180: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    fetch('/api/settings/pulse')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSettings(d) })
  }, [])

  async function save() {
    setSaving(true)
    const res = await fetch('/api/settings/pulse', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-lg">
      <div className="bg-card rounded-xl border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Customer Pulse</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send satisfaction surveys after every sale and track your scores
            </p>
          </div>
          <Switch
            checked={settings.pulse_enabled}
            onCheckedChange={v => setSettings(p => ({ ...p, pulse_enabled: v }))}
          />
        </div>

        {settings.pulse_enabled && (
          <div className="border-t pt-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-Send Triggers</p>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">On sale (immediately)</Label>
                <p className="text-xs text-muted-foreground">Survey sent when you mark a vehicle sold</p>
              </div>
              <Switch
                checked={settings.pulse_auto_send_on_sold}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_auto_send_on_sold: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">30-day follow-up</Label>
                <p className="text-xs text-muted-foreground">Second survey 30 days after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day30}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_send_day30: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">6-month follow-up</Label>
                <p className="text-xs text-muted-foreground">Third survey 6 months after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day180}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_send_day180: v }))}
              />
            </div>
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  )
}
