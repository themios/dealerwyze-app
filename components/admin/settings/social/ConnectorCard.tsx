'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

type ConnectorRow = {
  id: string
  connector_key: string
  display_name: string
  app_id: string | null
  enabled: boolean
  enabled_for_plans: string[]
}

const PLAN_OPTIONS = ['free', 'trial', 'growth', 'pro'] as const

interface ConnectorCardProps {
  connector: ConnectorRow
  onSaved: (updated: ConnectorRow) => void
}

export default function ConnectorCard({ connector, onSaved }: ConnectorCardProps) {
  const [form, setForm] = useState({
    app_id: connector.app_id ?? '',
    enabled: connector.enabled,
    enabled_for_plans: connector.enabled_for_plans ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = useMemo(() => {
    const basePlans = [...(connector.enabled_for_plans ?? [])].sort().join('|')
    const currentPlans = [...(form.enabled_for_plans ?? [])].sort().join('|')
    return (
      (connector.app_id ?? '') !== form.app_id ||
      connector.enabled !== form.enabled ||
      basePlans !== currentPlans
    )
  }, [connector, form])

  function togglePlan(plan: (typeof PLAN_OPTIONS)[number]) {
    setForm(prev => {
      const exists = prev.enabled_for_plans.includes(plan)
      const nextPlans = exists
        ? prev.enabled_for_plans.filter(item => item !== plan)
        : [...prev.enabled_for_plans, plan]
      return { ...prev, enabled_for_plans: nextPlans }
    })
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/settings/social/connector/${connector.connector_key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: form.app_id.trim() || null,
          enabled: form.enabled,
          enabled_for_plans: form.enabled_for_plans,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload?.error ?? 'Could not save connector')
        return
      }
      const updated = payload.data as ConnectorRow
      onSaved(updated)
      setForm({
        app_id: updated.app_id ?? '',
        enabled: updated.enabled,
        enabled_for_plans: updated.enabled_for_plans ?? [],
      })
    } catch {
      setError('Could not save connector')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-white font-medium">{connector.display_name}</p>
        <button
          type="button"
          onClick={() => setForm(prev => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.enabled ? 'bg-[#F07018]' : 'bg-white/20'
          }`}
          aria-label="Toggle connector enabled"
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              form.enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-3">
        <input
          value={form.app_id}
          onChange={event => setForm(prev => ({ ...prev, app_id: event.target.value }))}
          className="bg-[#07131F] border border-[#1B4A8A]/40 text-white rounded-lg px-3 py-2 text-sm w-full"
          placeholder="App ID / Client ID"
        />
      </div>

      <div className="mt-3">
        <p className="text-white/60 text-xs mb-2">Plans</p>
        <div className="flex items-center gap-4 flex-wrap">
          {PLAN_OPTIONS.map(plan => (
            <label key={plan} className="inline-flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="accent-[#F07018]"
                checked={form.enabled_for_plans.includes(plan)}
                onChange={() => togglePlan(plan)}
              />
              {plan}
            </label>
          ))}
        </div>
      </div>

      {dirty ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              void onSave()
            }}
            disabled={saving}
            className="bg-[#F07018] text-white px-4 py-1.5 rounded-md text-sm disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      ) : null}

      {error ? <p className="text-red-400 text-sm mt-3">{error}</p> : null}
    </div>
  )
}
