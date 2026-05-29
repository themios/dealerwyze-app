'use client'

import { formatCurrency } from '@/lib/utils'

interface Props {
  ytdTotal: number
  year: number
  dealCount: number
}

/**
 * YTDSummaryCard — large YTD commission total display.
 * Used on /commissions for both agents and brokers.
 */
export default function YTDSummaryCard({ ytdTotal, year, dealCount }: Props) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {year} YTD Commissions
      </p>
      <p className="mt-2 text-4xl font-bold text-foreground tracking-tight">
        {formatCurrency(ytdTotal)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {dealCount === 1 ? '1 closed deal' : `${dealCount} closed deals`}
      </p>
    </div>
  )
}
