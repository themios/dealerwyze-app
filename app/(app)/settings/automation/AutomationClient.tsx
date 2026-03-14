'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, MessageSquare, Mail } from 'lucide-react'

type AutoMode = 'manual' | 'semi_auto' | 'full_auto'

interface AutoSettings {
  // SMS
  automation_mode: AutoMode
  lead_response_sla_minutes: number
  followup_delay_hours: number
  followup_next_day_hour: number
  // Email
  email_automation_mode: AutoMode
  email_followup_delay_hours: number
  email_followup_next_day_hour: number
  email_signature: string
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
    desc: 'Entire sequence runs automatically until the lead replies.',
  },
]

interface Props {
  initial: AutoSettings
}

function ModeSelector({ value, onChange }: { value: AutoMode; onChange: (v: AutoMode) => void }) {
  return (
    <div className="space-y-2">
      {MODES.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`w-full text-left p-4 rounded-xl border transition-colors ${
            value === m.value
              ? 'border-[#F07018] bg-[#F07018]/5'
              : 'border-border bg-card hover:bg-accent'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-sm">{m.label}</p>
            {value === m.value && <CheckCircle className="h-4 w-4 text-[#F07018]" />}
          </div>
          <p className="text-xs text-muted-foreground">{m.desc}</p>
        </button>
      ))}
    </div>
  )
}

function ChipRow({
  options,
  value,
  suffix,
  onChange,
}: {
  options: number[]
  value: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      {options.map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
            value === v
              ? 'bg-[#F07018] text-white border-[#F07018]'
              : 'border-border hover:bg-accent'
          }`}
        >
          {v}{suffix}
        </button>
      ))}
    </div>
  )
}

export default function AutomationClient({ initial }: Props) {
  const [settings, setSettings] = useState<AutoSettings>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tab, setTab] = useState<'sms' | 'email'>('sms')

  async function save() {
    setSaving(true)
    setSaveError(null)
    const res = await fetch('/api/settings/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? 'Failed to save. Please try again.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-6">

      {/* Channel tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        <button
          onClick={() => setTab('sms')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'sms' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          SMS
        </button>
        <button
          onClick={() => setTab('email')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'email' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Email
        </button>
      </div>

      {tab === 'sms' && (
        <>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SMS Automation Mode</p>
            <ModeSelector
              value={settings.automation_mode}
              onChange={v => setSettings(s => ({ ...s, automation_mode: v }))}
            />
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SMS Timings</p>
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div>
                <label className="text-sm font-medium">Lead response SLA (minutes)</label>
                <p className="text-xs text-muted-foreground mb-2">How soon a lead_response task becomes "Must Do"</p>
                <ChipRow options={[5, 10, 15, 30]} value={settings.lead_response_sla_minutes} suffix="m"
                  onChange={v => setSettings(s => ({ ...s, lead_response_sla_minutes: v }))} />
              </div>
              <div>
                <label className="text-sm font-medium">First follow-up delay</label>
                <p className="text-xs text-muted-foreground mb-2">After first text, when to schedule the next SMS</p>
                <ChipRow options={[1, 2, 4, 6]} value={settings.followup_delay_hours} suffix="h"
                  onChange={v => setSettings(s => ({ ...s, followup_delay_hours: v }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Next-day follow-up time</label>
                <p className="text-xs text-muted-foreground mb-2">Hour of day for next-day SMS follow-up</p>
                <ChipRow options={[8, 9, 10, 11]} value={settings.followup_next_day_hour} suffix="am"
                  onChange={v => setSettings(s => ({ ...s, followup_next_day_hour: v }))} />
              </div>
            </div>
          </section>
        </>
      )}

      {tab === 'email' && (
        <>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email Automation Mode</p>
            <ModeSelector
              value={settings.email_automation_mode}
              onChange={v => setSettings(s => ({ ...s, email_automation_mode: v }))}
            />
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email Timings</p>
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div>
                <label className="text-sm font-medium">First follow-up delay</label>
                <p className="text-xs text-muted-foreground mb-2">After first email, when to schedule the next one</p>
                <ChipRow options={[2, 4, 8, 24]} value={settings.email_followup_delay_hours} suffix="h"
                  onChange={v => setSettings(s => ({ ...s, email_followup_delay_hours: v }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Next-day follow-up time</label>
                <p className="text-xs text-muted-foreground mb-2">Hour of day for next-day email follow-up</p>
                <ChipRow options={[8, 9, 10, 11]} value={settings.email_followup_next_day_hour} suffix="am"
                  onChange={v => setSettings(s => ({ ...s, email_followup_next_day_hour: v }))} />
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Auto-stop:</span>{' '}
                  If a customer replies by email or SMS, the sequence pauses and moves to manual.
                </p>
              </div>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email Signature</p>
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div>
                <label className="text-sm font-medium">Signature HTML</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Appended to every outbound email. You can paste plain text or HTML (e.g. bold name, phone, website link).
                </p>
                <Textarea
                  value={settings.email_signature}
                  onChange={e => setSettings(s => ({ ...s, email_signature: e.target.value }))}
                  rows={5}
                  className="font-mono text-xs resize-y"
                  placeholder={'<b>Tim — Apollo Auto</b><br>(805) 404-3873<br><a href="https://www.apolloauto-em.com">www.apolloauto-em.com</a>'}
                />
              </div>
              {settings.email_signature.trim() && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Preview</p>
                  <div
                    className="rounded-lg border bg-background p-3 text-sm"
                    dangerouslySetInnerHTML={{ __html: settings.email_signature }}
                  />
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}
      <Button onClick={save} disabled={saving} className="w-full">
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  )
}
