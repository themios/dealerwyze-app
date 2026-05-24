'use client'

import { useEffect, useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'

type PlanQuota = {
  id: string
  plan: 'free' | 'trial' | 'starter' | 'growth' | 'pro'
  max_leads: number | null
  max_staff_users: number | null
  max_locations: number | null
  monthly_sms_limit: number | null
  monthly_ai_asks: number | null
  video_renders_per_month: number | null
  updated_at: string | null
  updated_by: string | null
}

interface BillingQuotasClientProps {
  quotas: PlanQuota[]
}

function PlanQuotaRow({
  quota,
  onUpdated,
}: {
  quota: PlanQuota
  onUpdated: (updated: PlanQuota) => void
}) {
  const FIELDS = [
    'max_leads',
    'max_staff_users',
    'max_locations',
    'monthly_sms_limit',
    'monthly_ai_asks',
    'video_renders_per_month',
  ] as const
  type Field = (typeof FIELDS)[number]

  const toDisplay = (v: number | null) => (v === null ? '' : String(v))
  const toDB = (s: string): number | null => (s.trim() === '' ? null : Number(s.trim()))

  const [values, setValues] = useState<Record<Field, string>>(
    Object.fromEntries(FIELDS.map(f => [f, toDisplay(quota[f])])) as Record<Field, string>
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues(Object.fromEntries(FIELDS.map(f => [f, toDisplay(quota[f])])) as Record<Field, string>)
    setDirty(false)
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- FIELDS is a stable module-level constant
  }, [quota])

  const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    trial: 'Trial',
    starter: 'Starter',
    growth: 'Growth',
    pro: 'Pro',
  }
  const PLAN_COLORS: Record<string, string> = {
    free: 'text-white/40',
    trial: 'text-blue-400',
    starter: 'text-teal-400',
    growth: 'text-[#F07018]',
    pro: 'text-purple-400',
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const payload = Object.fromEntries(FIELDS.map(f => [f, toDB(values[f])])) as Record<Field, number | null>

    for (const f of FIELDS) {
      const v = payload[f]
      if (v !== null && (!Number.isInteger(v) || v < 0)) {
        setError(`${f}: must be a whole number or empty`)
        setSaving(false)
        return
      }
    }

    try {
      const res = await fetch(`/api/admin/settings/billing/${quota.plan}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Save failed')
        setSaving(false)
        return
      }
      onUpdated(data.data as PlanQuota)
      setDirty(false)
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <tr className="border-b border-[#1B4A8A]/20 last:border-0">
        <td className={`px-4 py-3 font-medium text-sm ${PLAN_COLORS[quota.plan]}`}>
          {PLAN_LABELS[quota.plan]}
        </td>
        {FIELDS.map(f => (
          <td key={f} className="px-2 py-2">
            <input
              type="number"
              min={0}
              value={values[f]}
              placeholder="∞"
              onChange={e => {
                setValues(p => ({ ...p, [f]: e.target.value }))
                setDirty(true)
              }}
              className="w-full bg-[#07131F] border border-[#1B4A8A]/30 text-white text-sm rounded px-2 py-1.5 placeholder-white/20 [appearance:textfield]"
            />
          </td>
        ))}
        <td className="px-2 py-2">
          {dirty ? (
            <button
              onClick={() => {
                void handleSave()
              }}
              disabled={saving}
              className="bg-[#F07018] hover:bg-[#F07018]/90 text-white text-xs px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? '…' : 'Save'}
            </button>
          ) : null}
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={8} className="px-4 pb-2 text-red-400 text-xs">
            {error}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default function BillingQuotasClient({ quotas }: BillingQuotasClientProps) {
  const [localQuotas, setLocalQuotas] = useState<PlanQuota[]>(quotas)

  return (
    <div className="p-6 max-w-5xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Billing & Quotas"
        description="Resource limits per plan. Leave blank or set to empty for unlimited."
      />

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1B4A8A]/30">
              <th className="text-left px-4 py-3 text-white/40 text-xs font-normal uppercase tracking-wider w-28">
                Plan
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                Max Leads
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                Max Staff
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                Max Locations
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                SMS/mo
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                AI Asks/mo
              </th>
              <th className="text-left px-2 py-3 text-white/40 text-xs font-normal uppercase tracking-wider">
                Video Renders/mo
              </th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {localQuotas.map(q => (
              <PlanQuotaRow
                key={q.plan}
                quota={q}
                onUpdated={updated =>
                  setLocalQuotas(prev => prev.map(r => (r.plan === updated.plan ? updated : r)))
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-white/30 text-xs mt-3">
        Empty cell = unlimited. Changes take effect immediately for new API calls.
      </p>
    </div>
  )
}
