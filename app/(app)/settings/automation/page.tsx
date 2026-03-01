'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

type AutoMode = 'manual' | 'semi_auto' | 'full_auto'

interface AutoSettings {
  automation_mode: AutoMode
  lead_response_sla_minutes: number
  followup_delay_hours: number
  followup_next_day_hour: number
}

const MODES: { value: AutoMode; label: string; desc: string }[] = [
  {
    value: 'manual',
    label: 'Manual (Recommended)',
    desc: 'Suggested message is shown — you tap Send. Full control, no accidental sends.',
  },
  {
    value: 'semi_auto',
    label: 'Semi-Auto',
    desc: 'First message is manual. Follow-ups send automatically unless the lead replies.',
  },
  {
    value: 'full_auto',
    label: 'Full Auto',
    desc: 'Entire sequence runs automatically until the lead replies. Requires SMS plan.',
  },
]

export default function AutomationSettingsPage() {
  const [settings, setSettings] = useState<AutoSettings>({
    automation_mode: 'manual',
    lead_response_sla_minutes: 10,
    followup_delay_hours: 2,
    followup_next_day_hour: 10,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings/automation')
      .then(r => r.json())
      .then((d: AutoSettings) => { setSettings(d); setLoading(false) })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div><TopBar title="Automation" /><p className="p-6 text-sm text-muted-foreground">Loading…</p></div>

  return (
    <div>
      <TopBar title="Automation" />
      <div className="px-4 py-4 space-y-6">

        {/* Mode selector */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SMS Automation Mode</p>
          <div className="space-y-2">
            {MODES.map(m => (
              <button
                key={m.value}
                onClick={() => setSettings(s => ({ ...s, automation_mode: m.value }))}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  settings.automation_mode === m.value
                    ? 'border-[#F07018] bg-[#F07018]/5'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{m.label}</p>
                  {settings.automation_mode === m.value && (
                    <CheckCircle className="h-4 w-4 text-[#F07018]" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* SLA timings */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Response Timings</p>
          <div className="space-y-4 rounded-xl border bg-card p-4">

            <div>
              <label className="text-sm font-medium">Lead response SLA (minutes)</label>
              <p className="text-xs text-muted-foreground mb-2">How soon a lead_response task becomes "Must Do"</p>
              <div className="flex items-center gap-3">
                {[5, 10, 15, 30].map(v => (
                  <button
                    key={v}
                    onClick={() => setSettings(s => ({ ...s, lead_response_sla_minutes: v }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      settings.lead_response_sla_minutes === v
                        ? 'bg-[#F07018] text-white border-[#F07018]'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {v}m
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">First follow-up delay (hours)</label>
              <p className="text-xs text-muted-foreground mb-2">After responding, when to schedule the first follow-up</p>
              <div className="flex items-center gap-3">
                {[1, 2, 4, 6].map(v => (
                  <button
                    key={v}
                    onClick={() => setSettings(s => ({ ...s, followup_delay_hours: v }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      settings.followup_delay_hours === v
                        ? 'bg-[#F07018] text-white border-[#F07018]'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {v}h
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Next-day follow-up time</label>
              <p className="text-xs text-muted-foreground mb-2">Hour of day for the next-day follow-up task</p>
              <div className="flex items-center gap-3">
                {[8, 9, 10, 11].map(v => (
                  <button
                    key={v}
                    onClick={() => setSettings(s => ({ ...s, followup_next_day_hour: v }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      settings.followup_next_day_hour === v
                        ? 'bg-[#F07018] text-white border-[#F07018]'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {v}am
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Button onClick={save} disabled={saving} className="w-full">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
