'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface FormState {
  achPromptsEnabled: boolean
  manualInstructionsEnabled: boolean
  zelleHandle: string
  venmoHandle: string
  cashappHandle: string
}

export default function BhphPaymentMethodsSection() {
  const [form, setForm] = useState<FormState>({
    achPromptsEnabled:         true,
    manualInstructionsEnabled: false,
    zelleHandle:               '',
    venmoHandle:               '',
    cashappHandle:             '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/settings/bhph-payment-methods', { credentials: 'same-origin' })
        if (res.status === 403) {
          if (!cancelled) {
            setForbidden(true)
            setLoading(false)
          }
          return
        }
        if (!res.ok) {
          if (!cancelled) setError('Could not load BHPH payment settings.')
          return
        }
        const data = await res.json() as FormState
        if (!cancelled) {
          setForm({
            achPromptsEnabled:         data.achPromptsEnabled !== false,
            manualInstructionsEnabled: !!data.manualInstructionsEnabled,
            zelleHandle:               data.zelleHandle ?? '',
            venmoHandle:               data.venmoHandle ?? '',
            cashappHandle:             data.cashappHandle ?? '',
          })
          setError(null)
        }
      } catch {
        if (!cancelled) setError('Could not load BHPH payment settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/settings/bhph-payment-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          achPromptsEnabled:         form.achPromptsEnabled,
          manualInstructionsEnabled: form.manualInstructionsEnabled,
          zelleHandle:               form.zelleHandle,
          venmoHandle:               form.venmoHandle,
          cashappHandle:             form.cashappHandle,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save.')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) return null

  return (
    <div className="rounded-[10px] border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">BHPH payment reminders</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Controls optional links and P2P instructions appended to SMS payment reminders.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="bhph-ach-prompts">Include bank payment setup link in reminders</Label>
              <p className="text-xs text-muted-foreground">Sends ACH setup when the customer is not on verified bank debit.</p>
            </div>
            <Switch
              id="bhph-ach-prompts"
              checked={form.achPromptsEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, achPromptsEnabled: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="bhph-manual-inst">Include manual payment instructions in reminders</Label>
              <p className="text-xs text-muted-foreground">Zelle, Venmo, and Cash App — customer can reply PAID after sending.</p>
            </div>
            <Switch
              id="bhph-manual-inst"
              checked={form.manualInstructionsEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, manualInstructionsEnabled: v }))}
            />
          </div>

          {form.manualInstructionsEnabled && (
            <div className="space-y-3 pt-1 border-t border-border">
              <div className="space-y-1.5">
                <Label htmlFor="bhph-zelle">Zelle (email or phone)</Label>
                <Input
                  id="bhph-zelle"
                  value={form.zelleHandle}
                  onChange={e => setForm(f => ({ ...f, zelleHandle: e.target.value }))}
                  placeholder="dealer@email.com"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bhph-venmo">Venmo</Label>
                <Input
                  id="bhph-venmo"
                  value={form.venmoHandle}
                  onChange={e => setForm(f => ({ ...f, venmoHandle: e.target.value }))}
                  placeholder="@YourDealership"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bhph-cashapp">Cash App</Label>
                <Input
                  id="bhph-cashapp"
                  value={form.cashappHandle}
                  onChange={e => setForm(f => ({ ...f, cashappHandle: e.target.value }))}
                  placeholder="$Cashtag"
                  maxLength={100}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}

          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      )}
    </div>
  )
}
