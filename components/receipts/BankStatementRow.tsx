'use client'

import Link from 'next/link'
import { ChevronRight, Landmark } from 'lucide-react'
import { formatRelative } from '@/lib/utils/relativeTime'

export interface BankStatementSummary {
  id: string
  bank_name: string | null
  account_last4: string | null
  statement_start: string | null
  statement_end: string | null
  status: string
  created_at: string
}

function periodLabel(start: string | null, end: string | null, fallback: string) {
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return fmt(start)
  if (end) return fmt(end)
  return fallback
}

export default function BankStatementRow({ s }: { s: BankStatementSummary }) {
  const label = s.bank_name ?? 'Bank statement'
  const period = periodLabel(s.statement_start, s.statement_end, formatRelative(s.created_at))

  const statusCls =
    s.status === 'ready' ? 'text-amber-600' :
    s.status === 'reconciled' ? 'text-green-600' :
    s.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'

  return (
    <Link
      href={`/receipts/reconcile/${s.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
    >
      <Landmark className="h-4 w-4 text-blue-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {label}
          {s.account_last4 && <span className="text-muted-foreground font-normal"> ···{s.account_last4}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{period}</p>
      </div>
      <span className={`text-xs font-medium capitalize flex-shrink-0 ${statusCls}`}>{s.status}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}
