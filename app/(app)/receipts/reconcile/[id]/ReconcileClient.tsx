'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Minus, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Statement {
  id: string
  bank_name: string | null
  account_last4: string | null
  statement_start: string | null
  statement_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  status: string
}

interface LedgerJoin {
  id: string
  date: string
  amount_total: number | null
  entry_type: string
  vendor_norm: string | null
  payer: string | null
  memo: string | null
  receipt_categories: { name: string } | { name: string }[] | null
}

interface BankLine {
  id: string
  line_date: string
  description: string
  amount: number
  direction: 'credit' | 'debit'
  balance_after: number | null
  match_status: 'matched' | 'pending' | 'cleared' | 'ignored'
  matched_ledger_id: string | null
  ledger_transactions?: LedgerJoin | LedgerJoin[] | null
}

interface Summary {
  total_lines: number
  matched: number
  pending: number
  cleared: number
  ignored: number
  ledger_only: number
}

interface Category {
  id: string
  name: string
  category_type: string
  requires_vehicle: boolean
}

interface Props {
  statement: Statement
  matched: BankLine[]
  bankOnly: BankLine[]
  cleared: BankLine[]
  ignored: BankLine[]
  ledgerOnly: LedgerJoin[]
  summary: Summary
  categories: Category[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAmt(n: number | null, direction?: 'credit' | 'debit') {
  if (n == null) return '—'
  const sign = direction === 'credit' ? '+' : direction === 'debit' ? '−' : ''
  return `${sign}$${Number(n).toFixed(2)}`
}

function catName(entry: LedgerJoin): string {
  const c = entry.receipt_categories
  if (!c) return ''
  return Array.isArray(c) ? (c[0]?.name ?? '') : c.name
}

function ledgerLabel(entry: LedgerJoin): string {
  return entry.entry_type === 'income'
    ? (entry.payer ?? 'Unknown payer')
    : (entry.vendor_norm ?? 'Unknown vendor')
}

// ── Section component ──────────────────────────────────────────────────────────

function Section({
  title, count, color, defaultOpen, children,
}: {
  title: string; count: number; color: string; defaultOpen: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${color}`}>{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color} bg-current/10`}>
            {count}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="divide-y border-t">{children}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReconcileClient({
  statement, matched: initialMatched, bankOnly: initialBankOnly,
  cleared: initialCleared, ignored: initialIgnored,
  ledgerOnly: initialLedgerOnly, categories,
}: Props) {
  const router = useRouter()
  const [matched, setMatched] = useState(initialMatched)
  const [bankOnly, setBankOnly] = useState(initialBankOnly)
  const [cleared, setCleared] = useState(initialCleared)
  const [ignored, setIgnored] = useState(initialIgnored)
  const [ledgerOnly, setLedgerOnly] = useState(initialLedgerOnly)
  const [statementStatus, setStatementStatus] = useState(statement.status)
  const [resolving, setResolving] = useState<string | null>(null)
  const [createLine, setCreateLine] = useState<BankLine | null>(null)
  const [createCategoryId, setCreateCategoryId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const createCategories = createLine
    ? categories.filter(c =>
        c.category_type === (createLine.direction === 'credit' ? 'income' : 'expense')
      )
    : []

  async function resolve(lineId: string, action: 'clear' | 'ignore' | 'unmatch', ledgerId?: string) {
    setResolving(lineId)
    try {
      const res = await fetch(`/api/receipts/bank-statements/${statement.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: lineId, action, ledger_id: ledgerId }),
      })
      const data = await res.json()
      if (!res.ok) return
      if (data.reconciled) setStatementStatus('reconciled')
      else setStatementStatus('ready')

      // Optimistic state update
      if (action === 'clear') {
        const line = bankOnly.find(l => l.id === lineId)
        if (line) {
          setBankOnly(prev => prev.filter(l => l.id !== lineId))
          setCleared(prev => [...prev, { ...line, match_status: 'cleared' }])
        }
      } else if (action === 'ignore') {
        const line = bankOnly.find(l => l.id === lineId)
        if (line) {
          setBankOnly(prev => prev.filter(l => l.id !== lineId))
          setIgnored(prev => [...prev, { ...line, match_status: 'ignored' }])
        }
      } else if (action === 'unmatch') {
        const line = matched.find(l => l.id === lineId)
        if (line) {
          setMatched(prev => prev.filter(l => l.id !== lineId))
          setBankOnly(prev => [...prev, { ...line, match_status: 'pending', matched_ledger_id: null, ledger_transactions: null }])
          if (data.ledger_only != null) {
            // Server may have reopened ledger-only rows; refresh for accuracy
            router.refresh()
          }
        }
      }
    } finally {
      setResolving(null)
    }
  }

  function openCreateEntry(line: BankLine) {
    setCreateLine(line)
    setCreateCategoryId('')
    setCreateError(null)
  }

  async function submitCreateEntry() {
    if (!createLine || !createCategoryId) {
      setCreateError('Choose a category')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`/api/receipts/bank-statements/${statement.id}/create-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: createLine.id, category_id: createCategoryId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create entry')

      setBankOnly(prev => prev.filter(l => l.id !== createLine.id))
      setMatched(prev => [...prev, { ...createLine, match_status: 'matched', matched_ledger_id: data.ledger_id }])
      setLedgerOnly(prev => prev.filter(e => e.id !== data.ledger_id))
      setCreateLine(null)
      if (data.reconciled) setStatementStatus('reconciled')
      router.refresh()
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const pendingCount = bankOnly.length + ledgerOnly.length
  const isFullyReconciled = pendingCount === 0

  return (
    <div className="px-4 pb-8 space-y-4">

      {/* Statement header */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {statement.bank_name ?? 'Bank Statement'}
            {statement.account_last4 && <span className="text-muted-foreground font-normal"> ···{statement.account_last4}</span>}
          </p>
          {statementStatus === 'reconciled' && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Reconciled
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {fmtDate(statement.statement_start)} – {fmtDate(statement.statement_end)}
        </p>
        {(statement.opening_balance != null || statement.closing_balance != null) && (
          <div className="flex gap-4 text-xs pt-1">
            {statement.opening_balance != null && (
              <span><span className="text-muted-foreground">Opening </span><span className="font-medium">${Number(statement.opening_balance).toFixed(2)}</span></span>
            )}
            {statement.closing_balance != null && (
              <span><span className="text-muted-foreground">Closing </span><span className="font-medium">${Number(statement.closing_balance).toFixed(2)}</span></span>
            )}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Matched', value: matched.length, cls: 'text-green-600' },
          { label: 'Pending', value: bankOnly.length, cls: bankOnly.length > 0 ? 'text-amber-500' : 'text-muted-foreground' },
          { label: 'Cleared', value: cleared.length, cls: 'text-muted-foreground' },
          { label: 'Ledger only', value: ledgerOnly.length, cls: ledgerOnly.length > 0 ? 'text-red-400' : 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-lg border bg-card py-2">
            <p className={`text-base font-bold ${cls}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Pending bank lines (need resolution) */}
      {bankOnly.length > 0 && (
        <Section title="In Bank — Needs Review" count={bankOnly.length} color="text-amber-600" defaultOpen>
          {bankOnly.map(line => (
            <div key={line.id} className="px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{line.description}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(line.line_date)}</p>
                </div>
                <p className={`text-sm font-bold flex-shrink-0 ${line.direction === 'credit' ? 'text-green-600' : 'text-foreground'}`}>
                  {fmtAmt(line.amount, line.direction)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs flex-1 border-green-300 text-green-700 hover:bg-green-50"
                  disabled={resolving === line.id}
                  onClick={() => resolve(line.id, 'clear')}
                >
                  {resolving === line.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Clear
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs flex-1"
                  disabled={resolving === line.id}
                  onClick={() => openCreateEntry(line)}
                >
                  + Create Entry
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  disabled={resolving === line.id}
                  onClick={() => resolve(line.id, 'ignore')}
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Ignore
                </Button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Ledger only (in our books but not in bank statement) */}
      {ledgerOnly.length > 0 && (
        <Section title="In Ledger — Not in Bank" count={ledgerOnly.length} color="text-red-500" defaultOpen>
          {ledgerOnly.map(entry => (
            <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ledgerLabel(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(entry.date)}
                  {catName(entry) ? ` · ${catName(entry)}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-semibold ${entry.entry_type === 'income' ? 'text-green-600' : ''}`}>
                  {entry.entry_type === 'income' ? '+' : ''}{fmtAmt(entry.amount_total)}
                </p>
                <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-0.5 justify-end">
                  <AlertTriangle className="h-3 w-3" /> Not cleared
                </p>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Matched */}
      {matched.length > 0 && (
        <Section title="Matched" count={matched.length} color="text-green-600" defaultOpen={false}>
          {matched.map(line => {
            const entry = line.ledger_transactions
              ? (Array.isArray(line.ledger_transactions) ? line.ledger_transactions[0] : line.ledger_transactions)
              : null
            return (
              <div key={line.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{line.description}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(line.line_date)}</p>
                  {entry && (
                    <p className="text-xs text-green-600 mt-0.5">
                      ↔ {ledgerLabel(entry)} · {fmtDate(entry.date)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className={`text-sm font-semibold ${line.direction === 'credit' ? 'text-green-600' : ''}`}>
                    {fmtAmt(line.amount, line.direction)}
                  </p>
                  <button
                    onClick={() => resolve(line.id, 'unmatch')}
                    disabled={resolving === line.id}
                    className="text-muted-foreground hover:text-foreground"
                    title="Unmatch"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {/* Cleared (no ledger entry needed) */}
      {cleared.length > 0 && (
        <Section title="Cleared" count={cleared.length} color="text-muted-foreground" defaultOpen={false}>
          {cleared.map(line => (
            <div key={line.id} className="px-4 py-2.5 flex items-center justify-between gap-2 opacity-60">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{line.description}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(line.line_date)}</p>
              </div>
              <p className="text-sm flex-shrink-0">{fmtAmt(line.amount, line.direction)}</p>
            </div>
          ))}
        </Section>
      )}

      {/* Ignored */}
      {ignored.length > 0 && (
        <Section title="Ignored" count={ignored.length} color="text-muted-foreground" defaultOpen={false}>
          {ignored.map(line => (
            <div key={line.id} className="px-4 py-2.5 flex items-center justify-between gap-2 opacity-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{line.description}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(line.line_date)}</p>
              </div>
              <p className="text-sm flex-shrink-0">{fmtAmt(line.amount, line.direction)}</p>
            </div>
          ))}
        </Section>
      )}

      {isFullyReconciled && (
        <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 px-4 py-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">Statement fully reconciled</p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">All transactions are accounted for.</p>
        </div>
      )}

      {createLine && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-4 shadow-lg space-y-3">
            <p className="text-sm font-semibold">Create ledger entry</p>
            <p className="text-xs text-muted-foreground truncate">{createLine.description}</p>
            <p className="text-sm font-bold">
              {fmtAmt(createLine.amount, createLine.direction)} · {fmtDate(createLine.line_date)}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={createCategoryId} onValueChange={setCreateCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {createCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError && <p className="text-xs text-destructive">{createError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCreateLine(null)} disabled={creating}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={submitCreateEntry} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post to ledger'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
