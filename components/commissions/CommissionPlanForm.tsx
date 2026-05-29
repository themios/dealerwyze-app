'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface CommissionPlan {
  id: string
  org_id: string
  plan_type: 'percentage_split' | 'flat_fee' | 'tiered'
  tier_name: string | null
  agent_id: string | null
  agent_split_pct: number | null
  broker_split_pct: number | null
  co_broke_pct: number | null
  referral_fee_flat: number
  referral_fee_pct: number
  is_default: boolean
  effective_at: string | null
  created_at: string
}

interface Props {
  plan?: CommissionPlan
  onSave: (plan: CommissionPlan) => void
  onCancel: () => void
}

export default function CommissionPlanForm({ plan, onSave, onCancel }: Props) {
  const [planType, setPlanType] = useState<'percentage_split' | 'flat_fee' | 'tiered'>(
    plan?.plan_type ?? 'percentage_split'
  )
  const [tierName, setTierName] = useState(plan?.tier_name ?? '')
  const [agentSplitPct, setAgentSplitPct] = useState(
    plan?.agent_split_pct != null ? String(plan.agent_split_pct) : ''
  )
  const [cobrokePct, setCobrokePct] = useState(
    plan?.co_broke_pct != null ? String(plan.co_broke_pct) : ''
  )
  const [referralFeeFlat, setReferralFeeFlat] = useState(
    plan?.referral_fee_flat != null && plan.referral_fee_flat > 0
      ? String(plan.referral_fee_flat)
      : ''
  )
  const [isDefault, setIsDefault] = useState(plan?.is_default ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived broker split
  const agentSplitNum = parseFloat(agentSplitPct)
  const brokerSplit =
    planType === 'percentage_split' && !isNaN(agentSplitNum) && agentSplitNum >= 0 && agentSplitNum <= 100
      ? 100 - agentSplitNum
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const body: Record<string, unknown> = {
      plan_type: planType,
      tier_name: tierName.trim() || null,
      is_default: isDefault,
      referral_fee_flat: parseFloat(referralFeeFlat) || 0,
      referral_fee_pct: 0,
    }

    if (planType === 'percentage_split') {
      const pct = parseFloat(agentSplitPct)
      if (isNaN(pct) || pct < 0 || pct > 100) {
        setError('Agent split must be a number between 0 and 100.')
        return
      }
      body.agent_split_pct = pct
      body.broker_split_pct = 100 - pct
    }

    if (cobrokePct !== '') {
      const co = parseFloat(cobrokePct)
      if (!isNaN(co)) body.co_broke_pct = co
    }

    setSaving(true)
    try {
      const url = plan ? `/api/commission-plans/${plan.id}` : '/api/commission-plans'
      const method = plan ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { plan?: CommissionPlan; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to save plan. Please try again.')
        return
      }
      if (data.plan) onSave(data.plan)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tier_name">Plan Name</Label>
        <Input
          id="tier_name"
          placeholder="e.g. Standard 70/30 Split"
          value={tierName}
          onChange={e => setTierName(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="plan_type">Plan Type</Label>
        <Select
          value={planType}
          onValueChange={v => setPlanType(v as typeof planType)}
        >
          <SelectTrigger id="plan_type" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage_split">Percentage Split</SelectItem>
            <SelectItem value="flat_fee">Flat Fee</SelectItem>
            <SelectItem value="tiered">Tiered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {planType === 'percentage_split' && (
        <div className="space-y-1.5">
          <Label htmlFor="agent_split_pct">Agent Split %</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id="agent_split_pct"
                type="number"
                min={0}
                max={100}
                step="0.1"
                placeholder="e.g. 70"
                value={agentSplitPct}
                onChange={e => setAgentSplitPct(e.target.value)}
                className="h-9 pr-6"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            {brokerSplit !== null && (
              <p className="text-sm text-muted-foreground whitespace-nowrap">
                Broker: {brokerSplit.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="co_broke_pct">
          Co-Broke % <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="relative">
          <Input
            id="co_broke_pct"
            type="number"
            min={0}
            max={100}
            step="0.1"
            placeholder="e.g. 3"
            value={cobrokePct}
            onChange={e => setCobrokePct(e.target.value)}
            className="h-9 pr-6"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Percentage paid to the buyer&apos;s agent out of gross commission.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="referral_fee_flat">
          Referral Fee <span className="text-muted-foreground font-normal">(optional, flat $)</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            id="referral_fee_flat"
            type="number"
            min={0}
            step="0.01"
            placeholder="0"
            value={referralFeeFlat}
            onChange={e => setReferralFeeFlat(e.target.value)}
            className="h-9 pl-6"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Deducted from gross commission before the agent/broker split.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is_default"
          type="checkbox"
          checked={isDefault}
          onChange={e => setIsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Label htmlFor="is_default" className="cursor-pointer">
          Use as office default plan
        </Label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : plan ? 'Save Changes' : 'Add Plan'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
