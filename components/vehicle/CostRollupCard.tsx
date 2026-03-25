'use client'

import { useRef } from 'react'

interface ReconCostSummary {
  purchase_price: number | null
  recon_checklist_total: number
  ledger_expenses_total: number
  flooring_fee: number
  floor_plan_interest: number
  total_investment: number
  list_price: number | null
  estimated_profit: number | null
}

interface Props {
  costSummary: ReconCostSummary
  mandatoryUnchecked?: number
  vehicleId?: string
  canEdit?: boolean
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type Decision = { label: string; color: string; bg: string }

function getDecision(summary: ReconCostSummary, mandatoryUnchecked: number): Decision {
  const { list_price, total_investment, recon_checklist_total, estimated_profit } = summary
  if (!list_price && !total_investment) {
    return { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted/50' }
  }
  if (list_price && list_price > 0 && total_investment > list_price * 0.80) {
    return { label: 'Wholesale / Caution', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20' }
  }
  const budget = list_price ? list_price * 0.125 : 0
  if (budget > 0 && recon_checklist_total > budget) {
    return { label: 'Trim Recon Spend', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' }
  }
  if (mandatoryUnchecked > 0) {
    return { label: 'Repair Before Sale', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' }
  }
  if (estimated_profit !== null && estimated_profit > 0) {
    return { label: 'Retail Ready', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/20' }
  }
  return { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted/50' }
}

export default function CostRollupCard({ costSummary, mandatoryUnchecked = 0, vehicleId, canEdit }: Props) {
  const { purchase_price, recon_checklist_total, ledger_expenses_total, flooring_fee, floor_plan_interest, total_investment, list_price, estimated_profit } = costSummary
  const profitColor = estimated_profit === null ? '' : estimated_profit >= 0 ? 'text-green-600' : 'text-red-600'
  const decision = getDecision(costSummary, mandatoryUnchecked)

  const flooringRef = useRef<HTMLInputElement>(null)
  const interestRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleSave() {
    if (!vehicleId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const fee = parseFloat(flooringRef.current?.value ?? '0') || 0
      const interest = parseFloat(interestRef.current?.value ?? '0') || 0
      fetch(`/api/vehicles/${vehicleId}/carrying-costs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flooring_fee: fee, floor_plan_interest: interest }),
      })
    }, 700)
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Investment Summary</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${decision.color} ${decision.bg}`}>
          {decision.label}
        </span>
      </div>

      <Row label="Purchase Price" value={fmt(purchase_price)} />
      <Row label="Recon Costs" value={fmt(recon_checklist_total)} />
      <Row label="Other Expenses" value={fmt(ledger_expenses_total)} />

      {/* Editable carrying costs */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Flooring Fee</span>
        {canEdit && vehicleId ? (
          <input
            ref={flooringRef}
            type="number"
            min="0"
            step="0.01"
            defaultValue={flooring_fee || ''}
            onChange={scheduleSave}
            placeholder="0.00"
            className="w-24 text-right rounded border px-2 py-0.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span>{fmt(flooring_fee)}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Floor Plan Interest</span>
        {canEdit && vehicleId ? (
          <input
            ref={interestRef}
            type="number"
            min="0"
            step="0.01"
            defaultValue={floor_plan_interest || ''}
            onChange={scheduleSave}
            placeholder="0.00"
            className="w-24 text-right rounded border px-2 py-0.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span>{fmt(floor_plan_interest)}</span>
        )}
      </div>

      <div className="border-t pt-1.5 flex justify-between text-sm font-semibold">
        <span>Total Investment</span>
        <span>{fmt(total_investment)}</span>
      </div>
      <Row label="List Price" value={fmt(list_price)} />
      <div className={`flex justify-between text-sm font-semibold ${profitColor}`}>
        <span>Est. Profit</span>
        <span>{fmt(estimated_profit)}</span>
      </div>
      {list_price && list_price > 0 && (
        <p className="text-[10px] text-muted-foreground pt-0.5">
          Recon budget: {fmt(list_price * 0.125)} (12.5% of list price)
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">Other Expenses includes receipts assigned to this vehicle.</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
