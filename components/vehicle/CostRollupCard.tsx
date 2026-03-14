'use client'

interface ReconCostSummary {
  purchase_price: number | null
  recon_checklist_total: number
  ledger_expenses_total: number
  total_investment: number
  list_price: number | null
  estimated_profit: number | null
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CostRollupCard({ costSummary }: { costSummary: ReconCostSummary }) {
  const { purchase_price, recon_checklist_total, ledger_expenses_total, total_investment, list_price, estimated_profit } = costSummary
  const profitColor = estimated_profit === null ? '' : estimated_profit >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="rounded-xl border bg-card p-4 space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Investment Summary</p>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Purchase Price</span>
        <span>{fmt(purchase_price)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Recon Costs</span>
        <span>{fmt(recon_checklist_total)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Other Expenses</span>
        <span>{fmt(ledger_expenses_total)}</span>
      </div>
      <div className="border-t pt-1.5 flex justify-between text-sm font-semibold">
        <span>Total Investment</span>
        <span>{fmt(total_investment)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">List Price</span>
        <span>{fmt(list_price)}</span>
      </div>
      <div className={`flex justify-between text-sm font-semibold ${profitColor}`}>
        <span>Est. Profit</span>
        <span>{fmt(estimated_profit)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">Other Expenses includes receipts assigned to this vehicle.</p>
    </div>
  )
}
