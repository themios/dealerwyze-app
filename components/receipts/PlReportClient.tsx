'use client'

import { useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PlReport } from '@/lib/receipts/buildPlReport'

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  initialReport: PlReport
  defaultDateFrom: string
  defaultDateTo: string
}

export default function PlReportClient({
  initialReport,
  defaultDateFrom,
  defaultDateTo,
}: Props) {
  const [report, setReport] = useState(initialReport)
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'month' | 'category' | 'vehicle'>('month')

  const incomeCats = useMemo(
    () => report.by_category.filter(c => c.category_type === 'income'),
    [report.by_category],
  )
  const expenseCats = useMemo(
    () => report.by_category.filter(c => c.category_type === 'expense'),
    [report.by_category],
  )

  async function reload() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const res = await fetch(`/api/receipts/pl?${params}`)
      const data = await res.json()
      if (res.ok) setReport(data.report)
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    window.location.href = `/api/receipts/pl/export?${params}`
  }

  return (
    <div className="px-4 pb-8 space-y-4">
      <div className="flex gap-2">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs flex-1" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs flex-1" />
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card py-3">
          <p className="text-lg font-bold text-green-600">{fmt(report.totals.income)}</p>
          <p className="text-[10px] text-muted-foreground">Income</p>
        </div>
        <div className="rounded-lg border bg-card py-3">
          <p className="text-lg font-bold">{fmt(report.totals.expenses)}</p>
          <p className="text-[10px] text-muted-foreground">Expenses</p>
        </div>
        <div className="rounded-lg border bg-card py-3">
          <p className={`text-lg font-bold ${report.totals.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {fmt(report.totals.net)}
          </p>
          <p className="text-[10px] text-muted-foreground">Net</p>
        </div>
      </div>

      <Button size="sm" variant="outline" className="w-full gap-2" onClick={exportCsv}>
        <Download className="h-4 w-4" />
        Export CSV for accountant
      </Button>

      <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
        {(['month', 'category', 'vehicle'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium capitalize transition-colors ${
              tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground'
            }`}
          >
            {t === 'month' ? 'By month' : t === 'category' ? 'By category' : 'By vehicle'}
          </button>
        ))}
      </div>

      {tab === 'month' && (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {report.by_month.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No transactions in this period</p>
          ) : (
            report.by_month.map(m => (
              <div key={m.month} className="px-4 py-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{m.month}</p>
                <div className="text-right text-xs space-y-0.5">
                  <p className="text-green-600">+{fmt(m.income)}</p>
                  <p>−{fmt(m.expenses)}</p>
                  <p className={`font-semibold ${m.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    Net {fmt(m.net)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'category' && (
        <div className="space-y-3">
          {incomeCats.length > 0 && (
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              <p className="text-xs font-semibold text-green-600 px-4 py-2 bg-green-50 dark:bg-green-950/20">Income</p>
              {incomeCats.map(c => (
                <div key={`${c.category_id}-${c.name}`} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="font-semibold text-green-600 flex-shrink-0">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          {expenseCats.length > 0 && (
            <div className="rounded-xl border bg-card divide-y overflow-hidden">
              <p className="text-xs font-semibold text-muted-foreground px-4 py-2 bg-muted/30">Expenses</p>
              {expenseCats.map(c => (
                <div key={`${c.category_id}-${c.name}`} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="font-semibold flex-shrink-0">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'vehicle' && (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {report.by_vehicle.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No vehicle-tagged transactions</p>
          ) : (
            report.by_vehicle.map(v => (
              <div key={v.vehicle_id} className="px-4 py-3 space-y-1">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{v.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.stock_no ? `#${v.stock_no}` : ''} · {v.status}
                    </p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${v.gross_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {fmt(v.gross_profit)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-[10px] text-muted-foreground">
                  <span>Income {fmt(v.income)}</span>
                  <span>Recon {fmt(v.recon_costs)}</span>
                  <span>Ledger exp. {fmt(v.ledger_expenses)}</span>
                  <span>Acquisition {fmt(v.acquisition)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
