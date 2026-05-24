'use client'

import { useEffect, useState } from 'react'

type FlagType = {
  id: string
  flag_key: string
  display_name: string
  description: string | null
  enabled_globally: boolean
  enabled_for_plans: string[]
  kill_switch: boolean
  updated_at: string | null
}

interface FlagRowProps {
  flag: FlagType
  onUpdated: (updated: FlagType) => void
}

const PLAN_OPTIONS = ['free', 'trial', 'starter', 'growth', 'pro'] as const

export default function FlagRow({ flag, onUpdated }: FlagRowProps) {
  const [plans, setPlans] = useState<string[]>(flag.enabled_for_plans ?? [])
  const [plansDirty, setPlansDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPlans(flag.enabled_for_plans ?? [])
    setPlansDirty(false)
  }, [flag.enabled_for_plans])

  async function handleToggle(field: 'enabled_globally' | 'kill_switch', value: boolean) {
    if (field === 'kill_switch' && value === true) {
      const confirmed = window.confirm(
        'Enable kill switch? This disables the feature for ALL orgs.'
      )
      if (!confirmed) return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/admin/settings/features/${flag.flag_key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload?.error ?? 'Could not update flag')
        return
      }
      onUpdated(payload.data as FlagType)
      setError(null)
    } catch {
      setError('Could not update flag')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePlans() {
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/settings/features/${flag.flag_key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_for_plans: plans }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload?.error ?? 'Could not update plans')
        return
      }
      onUpdated(payload.data as FlagType)
      setPlansDirty(false)
      setError(null)
    } catch {
      setError('Could not update plans')
    } finally {
      setSaving(false)
    }
  }

  function togglePlan(plan: (typeof PLAN_OPTIONS)[number]) {
    setPlans(prev => {
      const next = prev.includes(plan) ? prev.filter(item => item !== plan) : [...prev, plan]
      return next
    })
    setPlansDirty(true)
  }

  return (
    <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-start">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm">{flag.display_name}</p>
            {flag.kill_switch ? (
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded">
                KILL SWITCH ACTIVE
              </span>
            ) : null}
          </div>
          <p className="text-white/30 text-xs font-mono mt-0.5">{flag.flag_key}</p>
          {flag.description ? (
            <p className="text-white/50 text-xs mt-1">{flag.description}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-white/50 text-xs mb-1">Globally enabled</p>
            <button
              type="button"
              onClick={() => {
                void handleToggle('enabled_globally', !flag.enabled_globally)
              }}
              disabled={saving || flag.kill_switch}
              title={flag.kill_switch ? 'Kill switch is active' : undefined}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                flag.enabled_globally && !flag.kill_switch ? 'bg-[#F07018]' : 'bg-white/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  flag.enabled_globally && !flag.kill_switch ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div>
            <p className="text-red-400/70 text-xs mb-1">Kill switch</p>
            <button
              type="button"
              onClick={() => {
                void handleToggle('kill_switch', !flag.kill_switch)
              }}
              disabled={saving}
              className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                flag.kill_switch ? 'bg-red-500' : 'bg-white/10'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  flag.kill_switch ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <p className="text-white/40 text-xs mb-2">Available on</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {PLAN_OPTIONS.map(plan => (
              <label key={plan} className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-[#F07018]"
                  checked={plans.includes(plan)}
                  onChange={() => togglePlan(plan)}
                  disabled={saving}
                />
                {plan}
              </label>
            ))}
          </div>
          {plansDirty ? (
            <button
              type="button"
              onClick={() => {
                void handleSavePlans()
              }}
              disabled={saving}
              className="bg-[#F07018] text-white text-xs px-3 py-1 rounded-md mt-2 disabled:opacity-50"
            >
              Save
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-red-400 text-xs mt-1">{error}</p> : null}
    </div>
  )
}
