'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { Transaction, PipelineStatus } from '@/lib/transactions/types'
import TransactionStageBar from './TransactionStageBar'
import TransactionForm from './TransactionForm'

interface Props {
  vehicleId: string
  isAdmin:   boolean
}

type UIMode = 'view' | 'create' | 'edit'

function formatDate(value: string | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value))
}

/** Pick the single most-relevant transaction to show prominently. */
function pickActive(txns: Transaction[]): Transaction | null {
  // Prefer non-fallen, non-closed in created_at desc order; else the first
  const live = txns.find(t => t.pipeline_status !== 'fallen_through' && t.pipeline_status !== 'closed')
  return live ?? txns[0] ?? null
}

export default function TransactionPanel({ vehicleId, isAdmin }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [mode, setMode]                 = useState<UIMode>('view')
  const [advancing, setAdvancing]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/transactions?vehicle_id=${encodeURIComponent(vehicleId)}`)
      if (!res.ok) {
        setFetchError('Unable to load transaction data. Please refresh.')
        return
      }
      const data = await res.json() as { transactions: Transaction[] }
      setTransactions(data.transactions ?? [])
    } catch {
      setFetchError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => { void load() }, [load])

  async function handleAdvance(to: PipelineStatus) {
    const active = pickActive(transactions)
    if (!active) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/transactions/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_status: to }),
      })
      if (!res.ok) return
      await load()
    } finally {
      setAdvancing(false)
    }
  }

  async function handleFall() {
    const active = pickActive(transactions)
    if (!active) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/transactions/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_status: 'fallen_through' }),
      })
      if (!res.ok) return
      await load()
    } finally {
      setAdvancing(false)
    }
  }

  function handleSaved(t: Transaction) {
    setTransactions(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = t
        return next
      }
      return [t, ...prev]
    })
    setMode('view')
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-1/3 bg-muted rounded" />
          <div className="h-6 bg-muted rounded" />
          <div className="h-6 bg-muted rounded w-2/3" />
        </div>
      </div>
    )
  }

  // --- Error ---
  if (fetchError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-red-600 dark:text-red-400">
        {fetchError}
      </div>
    )
  }

  // --- Create mode ---
  if (mode === 'create') {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Create Transaction</p>
        <TransactionForm
          vehicleId={vehicleId}
          onSave={handleSaved}
          onCancel={() => setMode('view')}
        />
      </div>
    )
  }

  // --- Empty state ---
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">No transaction yet for this listing.</p>
        <Button size="sm" onClick={() => setMode('create')}>Create Transaction</Button>
      </div>
    )
  }

  const active = pickActive(transactions)
  const others = transactions.filter(t => t.id !== active?.id)

  // --- Edit mode ---
  if (mode === 'edit' && active) {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Edit Transaction</p>
        <TransactionForm
          vehicleId={vehicleId}
          transaction={active}
          onSave={handleSaved}
          onCancel={() => setMode('view')}
        />
      </div>
    )
  }

  // --- View mode ---
  return (
    <div className="space-y-3">
      {active && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Transaction</p>
              <p className="text-sm font-semibold">{active.transaction_number ?? 'TXN'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMode('edit')}>Edit</Button>
          </div>

          {/* Stage bar */}
          <TransactionStageBar
            currentStage={active.pipeline_status}
            onAdvance={handleAdvance}
            onFall={handleFall}
            isLoading={advancing}
            isAdmin={isAdmin}
          />

          {/* Key details */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {active.offer_amount != null && (
              <div>
                <p className="text-xs text-muted-foreground">Offer Amount</p>
                <p className="font-semibold tabular-nums">{formatCurrency(active.offer_amount)}</p>
              </div>
            )}
            {active.offer_date && (
              <div>
                <p className="text-xs text-muted-foreground">Offer Date</p>
                <p className="font-semibold">{formatDate(active.offer_date)}</p>
              </div>
            )}
            {active.inspection_deadline && (
              <div>
                <p className="text-xs text-muted-foreground">Inspection Deadline</p>
                <p className="font-semibold">{formatDate(active.inspection_deadline)}</p>
              </div>
            )}
            {active.commission_pct != null && (
              <div>
                <p className="text-xs text-muted-foreground">Commission %</p>
                <p className="font-semibold">{active.commission_pct}%</p>
              </div>
            )}
            {active.closing_date && (
              <div>
                <p className="text-xs text-muted-foreground">Closing Date</p>
                <p className="font-semibold">{formatDate(active.closing_date)}</p>
              </div>
            )}
            {active.final_sale_price != null && (
              <div>
                <p className="text-xs text-muted-foreground">Final Sale Price</p>
                <p className="font-semibold tabular-nums">{formatCurrency(active.final_sale_price)}</p>
              </div>
            )}
          </div>

          {/* Contingencies */}
          {active.contingencies && active.contingencies.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Contingencies</p>
              <div className="flex flex-wrap gap-1">
                {active.contingencies.map(c => (
                  <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Parties */}
          {active.parties && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Parties</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {active.parties.buyerAgent   && <p><span className="text-muted-foreground">Buyer agent:</span> {active.parties.buyerAgent}</p>}
                {active.parties.sellerAgent  && <p><span className="text-muted-foreground">Seller agent:</span> {active.parties.sellerAgent}</p>}
                {active.parties.titleCompany && <p><span className="text-muted-foreground">Title:</span> {active.parties.titleCompany}</p>}
                {active.parties.lender       && <p><span className="text-muted-foreground">Lender:</span> {active.parties.lender}</p>}
              </div>
            </div>
          )}

          {/* Notes */}
          {active.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
              <p className="text-sm">{active.notes}</p>
            </div>
          )}

          {/* Document pointer */}
          <p className="text-[11px] text-muted-foreground border-t pt-2 mt-2">
            Transaction documents are in the Private Files section above.
          </p>
        </div>
      )}

      {/* Other (collapsed) transactions */}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Previous transactions</p>
          {others.map(t => (
            <div key={t.id} className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center justify-between gap-2">
              <span className="font-mono">{t.transaction_number ?? t.id.slice(0, 8)}</span>
              <span className="capitalize text-muted-foreground">{t.pipeline_status.replace(/_/g, ' ')}</span>
              {t.offer_amount != null && (
                <span className="tabular-nums">{formatCurrency(t.offer_amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Allow creating additional transactions (e.g. after fallen through) */}
      {!transactions.some(t => t.pipeline_status !== 'fallen_through' && t.pipeline_status !== 'closed') && (
        <Button size="sm" variant="outline" onClick={() => setMode('create')}>
          Start New Transaction
        </Button>
      )}
    </div>
  )
}
