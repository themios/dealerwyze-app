'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface PaymentEntry {
  id: string
  payment_date: string
  amount_paid: number
  interest_portion: number
  principal_portion: number
  principal_balance_after: number
  payment_type: string
  notes: string | null
}

interface Props {
  entry: PaymentEntry
  formatDateShort: (iso: string) => string
  fmt: (amount: number) => string
  ledgerTypeBadgeClass: (type: string) => string
  ledgerTypeLabel: (type: string) => string
  truncNote: (note: string | null, len: number) => string
}

/**
 * Card layout for a single payment entry on mobile.
 * Replaces min-w-[640px] table for responsive BHPH payment history.
 */
export function PaymentMobileCard({
  entry,
  formatDateShort,
  fmt,
  ledgerTypeBadgeClass,
  ledgerTypeLabel,
  truncNote,
}: Props) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2.5 mb-2">
      {/* Header: Date + Type Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{formatDateShort(entry.payment_date)}</span>
        <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${ledgerTypeBadgeClass(entry.payment_type)}`}>
          {ledgerTypeLabel(entry.payment_type)}
        </span>
      </div>

      {/* Amount row */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-semibold tabular-nums">{fmt(entry.amount_paid)}</span>
      </div>

      {/* Interest row */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Interest</span>
        <span className="font-semibold tabular-nums">{fmt(entry.interest_portion)}</span>
      </div>

      {/* Principal row */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Principal</span>
        <span className="font-semibold tabular-nums">{fmt(entry.principal_portion)}</span>
      </div>

      {/* Balance after row */}
      <div className="flex items-center justify-between gap-2 text-sm border-t border-border pt-2">
        <span className="text-muted-foreground">Balance after</span>
        <span className="font-semibold tabular-nums">{fmt(entry.principal_balance_after)}</span>
      </div>

      {/* Notes if present */}
      {entry.notes && (
        <div className="text-xs text-muted-foreground italic bg-muted/40 rounded px-2 py-1.5">
          &ldquo;{truncNote(entry.notes, 72)}&rdquo;
        </div>
      )}
    </div>
  )
}
