'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import TopBar from '@/components/layout/TopBar'
import type { PaymentFrequency } from '@/lib/bhph/schedule'
import {
  computeBhphOutstandingBalance,
  computeBhphPaidPercent,
  financedPrincipalAmount,
  totalCollectedTowardContract,
} from '@/lib/bhph/balance'
import type { BhphPaymentLedgerEntry } from '@/types/index'
import DeferredPaymentManager, { type DeferredPaymentRow } from './DeferredPaymentManager'
import BhphGpsDevicePanel from '@/components/bhph/BhphGpsDevicePanel'
import BhphContractTermsPanel from '@/components/bhph/BhphContractTermsPanel'
import BhphInterestPayoffPanel from '@/components/bhph/BhphInterestPayoffPanel'
import type { BhphGpsDeviceFields } from '@/lib/bhph/gpsDevice'
import { formatAprFromStored, interestRateStoredToDecimal } from '@/lib/bhph/contractTerms'
import { computeBhphPaymentAllocation } from '@/lib/bhph/interestAllocation'
import {
  CheckCircle, AlertTriangle, ChevronLeft, Phone, Mail,
  History, Link2, DollarSign, MoreVertical, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { PaymentMobileCard } from '@/components/bhph/PaymentMobileCard'
import { useMediaQuery } from '@/hooks/useMediaQuery'

// ── Types ──────────────────────────────────────────────────────

interface Account {
  id: string
  loan_amount: number | null
  total_paid: number
  down_payment: number
  required_down_payment: number | null
  monthly_payment: number
  payment_frequency: string
  payment_day_anchor: number | null
  next_due_date: string
  frequency_anchor_date: string | null
  sms_consent: boolean
  email_consent: boolean
  notes: string | null
  gps_vendor: string | null
  gps_device_id: string | null
  gps_installed_at: string | null
  gps_notes: string | null
  status: string
  customer_email: string | null
  interest_rate?: number
  principal_balance?: number | null
  total_interest_paid?: number
  last_payment_date?: string | null
  created_at?: string
  payment_method_type?: string | null
  bank_verification_status?: string | null
  stripe_payment_method_id?: string | null
  pending_manual_payment_at?: string | null
  pending_manual_payment_amount?: number | null
  manual_payment_confirmed_at?: string | null
  customer: { id: string; name: string; primary_phone: string; email: string | null; sms_opt_out: boolean } | null
  vehicle: { id: string; year: number; make: string; model: string; stock_no: string | null; vin: string | null } | null
}

interface ReminderLog {
  id: string
  reminder_type: string
  channel: string
  status: string
  delivery_status: string | null
  scheduled_for: string
  sent_at: string | null
  delivered_at: string | null
  clicked_at: string | null
  click_count: number
  paid_at: string | null
}

interface Props {
  account: Account
  reminderLog: ReminderLog[]
  deferredPayments: DeferredPaymentRow[]
  canRecordManualPayment: boolean
  defaultAchMethod?: {
    bank_name: string | null
    last4: string | null
    verification_status: string
  } | null
}

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function contractCreatedYmd(createdAt: string | undefined): string {
  if (!createdAt) return localTodayYmd()
  return createdAt.slice(0, 10)
}

function localTodayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestampShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function reminderLabel(type: string) {
  switch (type) {
    case 'pre_3day': return '3-day reminder'
    case 'due_day': return 'Due today'
    case 'late_2day': return '2 days late'
    case 'late_7day': return '7 days late'
    default: return type
  }
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-green-500/10 text-green-700 dark:text-green-400'
    case 'delivered':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    case 'clicked':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
    case 'failed':
    case 'undelivered':
      return 'bg-red-500/10 text-red-700 dark:text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function deriveReminderOutcome(log: ReminderLog) {
  if (log.paid_at) return 'paid'
  if (log.clicked_at) return 'clicked'
  if (log.delivery_status === 'delivered' || log.delivery_status === 'read') return 'delivered'
  if (log.delivery_status === 'failed' || log.delivery_status === 'undelivered' || log.status === 'failed') return 'failed'
  return log.status
}

function truncNote(s: string | null, max: number) {
  if (!s) return '—'
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function ledgerTypeLabel(t: string) {
  switch (t) {
    case 'regular': return 'Regular'
    case 'partial': return 'Partial'
    case 'extra': return 'Extra'
    case 'payoff': return 'Payoff'
    case 'failed_ach': return 'Failed ACH'
    case 'manual': return 'Manual (P2P)'
    default: return t
  }
}

function ledgerTypeBadgeClass(t: string) {
  switch (t) {
    case 'payoff':
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
    case 'partial':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
    case 'extra':
      return 'bg-sky-500/15 text-sky-800 dark:text-sky-300'
    case 'failed_ach':
      return 'bg-red-500/15 text-red-700 dark:text-red-400'
    case 'manual':
      return 'bg-teal-500/15 text-teal-800 dark:text-teal-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/**
 * Reconstruct the payment schedule backwards from next_due_date.
 * We know total_paid / monthly_payment = number of payments made.
 */
function buildSchedule(acct: Account) {
  const freq = (acct.payment_frequency ?? 'monthly') as PaymentFrequency
  const anchor = acct.payment_day_anchor ?? undefined
  const pmtAmount = acct.monthly_payment
  const financed = financedPrincipalAmount(acct) ?? acct.loan_amount ?? 0
  const totalPayments = financed > 0 ? Math.ceil(financed / pmtAmount) : 24
  const paymentsMade = Math.floor((acct.total_paid ?? 0) / pmtAmount)

  const dates: string[] = []
  let current = acct.next_due_date

  for (let i = 0; i < Math.min(paymentsMade + 4, totalPayments); i++) {
    dates.unshift(current)
    const d = new Date(current + 'T12:00:00Z')
    if (freq === 'weekly') d.setUTCDate(d.getUTCDate() - 7)
    else if (freq === 'biweekly') d.setUTCDate(d.getUTCDate() - 14)
    else {
      d.setUTCMonth(d.getUTCMonth() - 1)
      if (anchor) {
        const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
        d.setUTCDate(Math.min(anchor, lastDay))
      }
    }
    current = d.toISOString().split('T')[0]
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return dates.map((date, i) => {
    const d = new Date(date + 'T12:00:00')
    const isPaid = i < paymentsMade
    const isNext = date === acct.next_due_date
    const isOverdue = !isPaid && d < today
    return {
      date,
      amount: pmtAmount,
      paymentNum: i + 1,
      totalPayments,
      isPaid,
      isOverdue,
      isNext,
    }
  }).reverse()
}

// ── Record payment (API + modal) ────────────────────────────────

type PayType = 'regular' | 'partial' | 'extra' | 'payoff'

function RecordPaymentSheet({
  open,
  onOpenChange,
  accountId,
  defaultAmount,
  onRecorded,
  interestRateAnnual,
  principalBalance,
  lastPaymentDate,
  contractCreatedDate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  accountId: string
  defaultAmount: number
  onRecorded: () => void
  interestRateAnnual: number
  principalBalance: number | null
  lastPaymentDate: string | null
  contractCreatedDate: string
}) {
  const [paymentDate, setPaymentDate] = useState(() => localTodayYmd())
  const [amount, setAmount] = useState(() => String(defaultAmount))
  const [paymentType, setPaymentType] = useState<PayType>('regular')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    interest: number
    principal: number
    remaining: number
    paidOff: boolean
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const previewAmt = parseFloat(amount)
  const allocationPreview =
    Number.isFinite(previewAmt) &&
    previewAmt > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) &&
    interestRateAnnual > 0 &&
    principalBalance != null
      ? computeBhphPaymentAllocation({
          paymentAmount: previewAmt,
          paymentDate,
          interestRateAnnual,
          principalBalance,
          lastPaymentDate,
          contractCreatedDate,
        })
      : null

  function submit() {
    setError(null)
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setError('Invalid payment date.')
      return
    }
    if (paymentDate > localTodayYmd()) {
      setError('Payment date cannot be in the future.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/bhph/${accountId}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amt,
            paymentDate,
            paymentType,
            notes: notes.trim() || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Could not record payment')
          return
        }
        const interest = Number(data.ledgerEntry?.interestPortion ?? 0)
        const principal = Number(data.ledgerEntry?.principalPortion ?? 0)
        const remaining = data.newBalance != null ? Number(data.newBalance) : NaN
        setSuccess({
          interest,
          principal,
          remaining: Number.isFinite(remaining) ? remaining : 0,
          paidOff: !!data.paidOff,
        })
        onRecorded()
        router.refresh()
      } catch {
        setError('Could not record payment')
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription>
            Cash, check, or in-person payment. Allocates interest and principal using your contract rate.
          </SheetDescription>
        </SheetHeader>

        {success ? (
          <div className="space-y-4 px-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="text-foreground">
                Interest: {fmt(success.interest)} · Principal: {fmt(success.principal)} · Remaining balance:{' '}
                {fmt(success.remaining)}
              </p>
            </div>
            {success.paidOff && (
              <span className="inline-flex text-[11px] font-semibold px-2 py-1 rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
                Contract paid off
              </span>
            )}
            <SheetFooter className="px-0 sm:justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </SheetFooter>
          </div>
        ) : (
          <div className="space-y-4 px-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                max={localTodayYmd()}
                onChange={e => setPaymentDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amt">Amount</Label>
              <Input
                id="pay-amt"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            {allocationPreview && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estimated allocation ({formatAprFromStored(interestRateAnnual)})
                </p>
                <p className="text-foreground tabular-nums">
                  Interest: {fmt(allocationPreview.interestPortion)} · Principal:{' '}
                  {fmt(allocationPreview.principalPortion)} · Balance after:{' '}
                  {fmt(allocationPreview.principalBalanceAfter)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {allocationPreview.daysSinceLast} day(s) since last accrual start
                </p>
              </div>
            )}
            {interestRateAnnual <= 0 && principalBalance != null && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                No interest rate on this contract — payment applies entirely to principal. Use Edit
                terms to set APR.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Payment type</Label>
              <Select value={paymentType} onValueChange={v => setPaymentType(v as PayType)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="extra">Extra</SelectItem>
                  <SelectItem value="payoff">Payoff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea
                id="pay-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Check #, receipt, etc."
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <SheetFooter className="px-0 flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" className="bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white" onClick={submit} disabled={pending}>
                {pending ? 'Recording…' : 'Record payment'}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ConfirmManualPaymentSheet({
  open,
  onOpenChange,
  accountId,
  defaultAmount,
  defaultPaymentDateYmd,
  onConfirmed,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  accountId: string
  defaultAmount: number
  defaultPaymentDateYmd: string
  onConfirmed: () => void
}) {
  const [paymentDate, setPaymentDate] = useState(defaultPaymentDateYmd)
  const [amount, setAmount] = useState(() => String(defaultAmount))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setError('Invalid payment date.')
      return
    }
    if (paymentDate > localTodayYmd()) {
      setError('Payment date cannot be in the future.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/bhph/${accountId}/confirm-manual-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amt,
            paymentDate,
            notes: notes.trim() || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Could not confirm payment')
          return
        }
        toast.success('Payment confirmed.')
        onConfirmed()
        onOpenChange(false)
        router.replace(`/bhph/${accountId}`, { scroll: false })
        router.refresh()
      } catch {
        setError('Could not confirm payment.')
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-lg sm:mx-auto rounded-t-xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Confirm manual payment</SheetTitle>
          <SheetDescription>
            Record the Zelle, Venmo, or Cash App payment the customer said they sent.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="confirm-amt">Amount</Label>
            <Input
              id="confirm-amt"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-date">Payment date</Label>
            <Input
              id="confirm-date"
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-notes">Notes (optional)</Label>
            <Textarea
              id="confirm-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="Confirmation #, app used, etc."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SheetFooter className="px-0 flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white"
              onClick={submit}
              disabled={pending}
            >
              {pending ? 'Confirming…' : 'Confirm payment'}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PaymentHistorySection({ contractId, reloadToken }: { contractId: string; reloadToken: number }) {
  const [entries, setEntries] = useState<BhphPaymentLedgerEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/bhph/${contractId}/ledger`, { credentials: 'same-origin' })
        if (!res.ok) {
          if (!cancelled) {
            setFailed(true)
            setEntries([])
          }
          return
        }
        const data = await res.json()
        if (!cancelled) {
          setEntries(Array.isArray(data.entries) ? data.entries : [])
          setFailed(false)
        }
      } catch {
        if (!cancelled) {
          setFailed(true)
          setEntries([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [contractId, reloadToken])

  return (
    <details open className="group mt-6 rounded-[10px] border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-[15px] font-semibold text-foreground">Payment History</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-2 pb-4 pt-2">
        {entries === null && !failed && (
          <p className="px-2 py-4 text-sm text-muted-foreground">Loading…</p>
        )}
        {failed && (
          <p className="px-2 py-4 text-sm text-destructive">Could not load payment history.</p>
        )}
        {entries && entries.length === 0 && !failed && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
        {entries && entries.length > 0 && (
          <>
            {/* Mobile: card stack layout */}
            {isMobile ? (
              <div className="space-y-1 px-1">
                {entries.map(row => (
                  <PaymentMobileCard
                    key={row.id}
                    entry={row}
                    formatDateShort={formatDateShort}
                    fmt={fmt}
                    ledgerTypeBadgeClass={ledgerTypeBadgeClass}
                    ledgerTypeLabel={ledgerTypeLabel}
                    truncNote={truncNote}
                  />
                ))}
              </div>
            ) : (
              /* Desktop: table layout */
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-right">Interest</th>
                      <th className="px-2 py-2 text-right">Principal</th>
                      <th className="px-2 py-2 text-right">Balance after</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(row => (
                      <tr key={row.id} className="border-b border-border/80 last:border-0">
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateShort(row.payment_date)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(row.amount_paid)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(row.interest_portion)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(row.principal_portion)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(row.principal_balance_after)}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${ledgerTypeBadgeClass(row.payment_type)}`}>
                            {ledgerTypeLabel(row.payment_type)}
                          </span>
                        </td>
                        <td className="px-2 py-2 max-w-[140px] truncate text-muted-foreground" title={row.notes ?? undefined}>
                          {truncNote(row.notes, 48)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function BhphDetailClient({
  account: acct,
  reminderLog,
  deferredPayments,
  canRecordManualPayment,
  defaultAchMethod,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordSheetKey, setRecordSheetKey] = useState(0)
  const [ledgerReload, setLedgerReload] = useState(0)
  const [achPromptBusy, setAchPromptBusy] = useState(false)
  const [confirmManualOpen, setConfirmManualOpen] = useState(false)

  function openRecordPayment() {
    setRecordSheetKey(k => k + 1)
    setRecordOpen(true)
  }

  const pendingManual = !!acct.pending_manual_payment_at && !acct.manual_payment_confirmed_at
  const pendingManualYmd = acct.pending_manual_payment_at
    ? acct.pending_manual_payment_at.slice(0, 10)
    : localTodayYmd()
  const pendingManualAmt = acct.pending_manual_payment_amount ?? acct.monthly_payment
  const pendingStale =
    pendingManual &&
    acct.pending_manual_payment_at &&
    Date.now() - new Date(acct.pending_manual_payment_at).getTime() > 24 * 60 * 60 * 1000

  useEffect(() => {
    if (
      searchParams.get('confirm_payment') === '1' &&
      pendingManual &&
      canRecordManualPayment
    ) {
      setConfirmManualOpen(true)
    }
  }, [searchParams, pendingManual, canRecordManualPayment])

  async function sendAchSetupPrompt() {
    setAchPromptBusy(true)
    try {
      const res = await fetch(`/api/bhph/${acct.id}/send-ach-prompt`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not send setup text.')
        return
      }
      toast.success('ACH setup link sent to the customer.')
    } catch {
      toast.error('Could not send setup text.')
    } finally {
      setAchPromptBusy(false)
    }
  }

  const customer = acct.customer
  const vehicle  = acct.vehicle

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nextDue = new Date(acct.next_due_date + 'T12:00:00')
  const daysUntilNext = Math.round((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const isOverdue = daysUntilNext < 0

  const balance = computeBhphOutstandingBalance(acct)
  const paidPct = computeBhphPaidPercent(acct)
  const collected = totalCollectedTowardContract(acct)
  const financedForSchedule = financedPrincipalAmount(acct)

  const totalPayments =
    financedForSchedule && acct.monthly_payment
      ? Math.ceil(financedForSchedule / acct.monthly_payment)
      : null
  const paymentsMade = acct.monthly_payment
    ? Math.floor((acct.total_paid ?? 0) / acct.monthly_payment)
    : null

  const schedule = buildSchedule(acct)
  const deferredOutstanding = deferredPayments
    .filter(row => row.status === 'scheduled')
    .reduce((sum, row) => sum + row.amount, 0)

  const deferredBalanceRemaining = Math.max(
    0,
    Math.round(
      ((acct.required_down_payment ?? 0) - (acct.down_payment ?? 0)) * 100,
    ) / 100,
  )

  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : 'Unknown vehicle'

  const isOnTrack = !isOverdue
  const recentReminderLog = reminderLog.slice(0, 6)
  const interestRateDecimal = interestRateStoredToDecimal(acct.interest_rate)
  const totalInterestPaid = acct.total_interest_paid ?? 0
  const principalForAllocation =
    acct.principal_balance != null
      ? Math.max(0, acct.principal_balance)
      : balance

  return (
    <div className="min-h-screen bg-background">
      <ConfirmManualPaymentSheet
        key={acct.pending_manual_payment_at ?? 'no-pending'}
        open={confirmManualOpen}
        onOpenChange={setConfirmManualOpen}
        accountId={acct.id}
        defaultAmount={pendingManualAmt}
        defaultPaymentDateYmd={pendingManualYmd}
        onConfirmed={() => setLedgerReload(k => k + 1)}
      />
      <RecordPaymentSheet
        key={recordSheetKey}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        accountId={acct.id}
        defaultAmount={acct.monthly_payment}
        onRecorded={() => {
          setLedgerReload(k => k + 1)
          router.refresh()
        }}
        interestRateAnnual={interestRateDecimal}
        principalBalance={principalForAllocation}
        lastPaymentDate={acct.last_payment_date ?? null}
        contractCreatedDate={contractCreatedYmd(acct.created_at)}
      />

      {/* Mobile TopBar */}
      <div className="lg:hidden">
        <TopBar
          title={customer?.name ?? 'BHPH Account'}
          left={<Link href="/bhph"><ChevronLeft className="h-5 w-5" /></Link>}
        />
      </div>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 px-6 py-3 text-sm text-muted-foreground border-b border-border">
        <Link href="/bhph" className="hover:text-foreground transition-colors">BHPH / Finance</Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-foreground font-medium">{customer?.name}</span>
      </div>

      {/* Content grid: single col mobile, 2-col desktop */}
      <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-0 lg:items-start">

        {/* ── Left / Main ───────────────────────────────────── */}
        <div className="pb-32 lg:pb-8 lg:border-r lg:border-border">

          {/* Header */}
          <div className="px-4 lg:px-6 py-4 lg:py-6 border-b border-border">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-[family-name:var(--font-display)] font-bold text-lg lg:text-xl">
                  {getInitials(customer?.name ?? '?')}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-[family-name:var(--font-display)] text-[22px] lg:text-[26px] font-bold leading-tight text-foreground">
                    {customer?.name}
                  </h1>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    BHPH
                  </span>
                  {acct.status === 'paid_off' && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
                      Paid off
                    </span>
                  )}
                  {acct.sms_consent && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
                      AUTO-PAY ON
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
                  {customer?.primary_phone && (
                    <a href={`tel:${customer.primary_phone}`} className="hover:text-foreground transition-colors">
                      {customer.primary_phone}
                    </a>
                  )}
                  {vehicle && (
                    <span>{vehicleLabel}</span>
                  )}
                  {vehicle?.vin && (
                    <span className="font-mono text-xs tracking-wide">{vehicle.vin}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {pendingManual && canRecordManualPayment && (
            <div className="px-4 lg:px-6 pt-2">
              <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
                <p className="text-sm text-amber-950 dark:text-amber-100">
                  <span className="font-semibold">{customer?.name ?? 'Customer'}</span>
                  {' '}replied PAID on{' '}
                  {acct.pending_manual_payment_at
                    ? formatTimestampShort(acct.pending_manual_payment_at)
                    : '—'}
                  . Verify in your bank app, then confirm below.
                </p>
                {pendingStale && (
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Unconfirmed for 24+ hours — please verify and confirm or contact the customer.
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-600/90 text-white"
                  onClick={() => setConfirmManualOpen(true)}
                >
                  Confirm Payment
                </Button>
              </div>
            </div>
          )}

          {/* Loan summary + down payment */}
          <div className="px-4 lg:px-6 py-4 space-y-3">

            <BhphContractTermsPanel
              contractId={acct.id}
              initial={{
                interest_rate: acct.interest_rate ?? null,
                monthly_payment: acct.monthly_payment,
                payment_frequency: acct.payment_frequency,
                payment_day_anchor: acct.payment_day_anchor,
                notes: acct.notes,
              }}
              readOnly={!canRecordManualPayment}
            />

            <BhphInterestPayoffPanel
              key={ledgerReload}
              contractId={acct.id}
              interestRate={acct.interest_rate}
              canManage={canRecordManualPayment}
            />

            <div className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan summary</p>
                <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isOnTrack
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  <CheckCircle className="h-3 w-3" />
                  {isOnTrack ? 'On track' : 'Overdue'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Interest rate</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatAprFromStored(acct.interest_rate)}
                  </p>
                </div>
                {balance != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Current principal balance</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {fmt(balance)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Interest paid (total)</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {fmt(totalInterestPaid)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">See Interest &amp; payoff for YTD</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total</p>
                  <p className="text-xl font-[family-name:var(--font-display)] font-bold text-foreground">
                    {fmt(acct.loan_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Paid</p>
                  <p className="text-xl font-[family-name:var(--font-display)] font-bold text-green-600 dark:text-green-400">
                    {fmt(collected)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Balance</p>
                  <p className="text-xl font-[family-name:var(--font-display)] font-bold text-[var(--brand-orange)]">
                    {fmt(balance)}
                  </p>
                </div>
              </div>

              {acct.loan_amount && (
                <>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {paidPct}% paid
                    {paymentsMade != null && totalPayments != null && (
                      <span className="ml-2">{paymentsMade} of {totalPayments} payments</span>
                    )}
                  </p>
                </>
              )}
              {canRecordManualPayment && acct.status === 'active' && (
                <Button
                  type="button"
                  className="w-full mt-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-semibold lg:hidden"
                  onClick={openRecordPayment}
                >
                  <DollarSign className="h-4 w-4 mr-1.5" />
                  Record payment
                </Button>
              )}
            </div>

            <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment method</p>
                {canRecordManualPayment && acct.status === 'active' && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white shrink-0"
                    onClick={openRecordPayment}
                  >
                    <DollarSign className="h-3.5 w-3.5 mr-1" />
                    Record payment
                  </Button>
                )}
              </div>
              {acct.status === 'paid_off' && (
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">Contract paid off</p>
              )}
              {acct.payment_method_type === 'ach' && acct.bank_verification_status === 'verified' && (
                <p className="text-sm text-foreground">
                  Bank{defaultAchMethod?.bank_name ? `: ${defaultAchMethod.bank_name}` : ''}
                  {defaultAchMethod?.last4 ? ` ···${defaultAchMethod.last4}` : ''}
                  <span className="text-muted-foreground"> · Automatic</span>
                </p>
              )}
              {acct.payment_method_type === 'ach' && acct.bank_verification_status === 'pending' && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Bank setup pending (micro-deposit verification).
                </p>
              )}
              {(acct.payment_method_type == null ||
                acct.payment_method_type === 'card' ||
                acct.payment_method_type === 'manual') && (
                <p className="text-sm text-muted-foreground">Card payments and manual recording.</p>
              )}
              {canRecordManualPayment && acct.status === 'active' && acct.sms_consent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={achPromptBusy || !customer?.primary_phone || !!customer?.sms_opt_out}
                  onClick={() => void sendAchSetupPrompt()}
                >
                  {achPromptBusy ? 'Sending…' : 'Set up bank payments'}
                </Button>
              )}
              {canRecordManualPayment && acct.status === 'active' && (!customer?.primary_phone || customer?.sms_opt_out) && (
                <p className="text-xs text-muted-foreground">
                  Add a mobile number and SMS consent to send an ACH setup link.
                </p>
              )}
            </div>

            <BhphGpsDevicePanel
              contractId={acct.id}
              initial={{
                gps_vendor: acct.gps_vendor,
                gps_device_id: acct.gps_device_id,
                gps_installed_at: acct.gps_installed_at,
                gps_notes: acct.gps_notes,
              } satisfies BhphGpsDeviceFields}
            />

            {acct.down_payment > 0 && (
              <div className="bg-card border border-border rounded-[10px] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Down payment</p>
                    {acct.frequency_anchor_date && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Received {formatDateShort(acct.frequency_anchor_date)}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-lg font-[family-name:var(--font-display)] font-bold text-foreground">
                  {fmt(acct.down_payment)}
                </p>
              </div>
            )}

            {(acct.required_down_payment ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-[10px] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Required down payment</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deferred remaining {fmt(deferredOutstanding)}
                  </p>
                </div>
                <p className="text-lg font-[family-name:var(--font-display)] font-bold text-foreground">
                  {fmt(acct.required_down_payment)}
                </p>
              </div>
            )}
          </div>

          <div className="px-4 lg:px-6 pb-4">
            <DeferredPaymentManager
              contractId={acct.id}
              rows={deferredPayments}
              deferredBalanceRemaining={deferredBalanceRemaining}
            />
          </div>

          <div className="px-4 lg:px-6">
            <PaymentHistorySection contractId={acct.id} reloadToken={ledgerReload} />
          </div>

          {/* Payment schedule */}
          <div className="px-4 lg:px-6 mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[15px] text-foreground">Payment schedule</h2>
              <div className="flex items-center gap-2">
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground px-3 py-2.5 min-h-[44px] rounded-md hover:bg-muted transition-colors">
                  All payments
                </button>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground px-3 py-2.5 min-h-[44px] rounded-md hover:bg-muted transition-colors">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="hidden lg:grid grid-cols-[1fr_120px_120px_40px] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              <span>Date</span>
              <span>Amount</span>
              <span>Status</span>
              <span />
            </div>

            <div className="space-y-0 rounded-[10px] overflow-hidden border border-border">
              {schedule.map((row) => (
                <div
                  key={row.date}
                  className={`px-3 py-3 lg:grid lg:grid-cols-[1fr_120px_120px_40px] lg:items-center flex items-center justify-between border-b border-border last:border-0 transition-colors ${
                    row.isOverdue ? 'bg-red-500/5' : row.isNext ? 'bg-accent/40' : 'bg-card'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {row.isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      <p className={`text-sm font-medium ${row.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                        {formatDate(row.date)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Payment {String(row.paymentNum).padStart(2, '0')}/{String(row.totalPayments).padStart(2, '0')}
                    </p>
                  </div>

                  <p className={`text-sm font-semibold tabular-nums ${
                    row.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                  }`}>
                    {fmt(row.amount)}
                  </p>

                  <div className="flex items-center gap-2">
                    {row.isPaid && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">
                        PAID
                      </span>
                    )}
                    {row.isOverdue && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        OVERDUE
                      </span>
                    )}
                    {!row.isPaid && !row.isOverdue && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {row.isNext ? 'Next' : 'Upcoming'}
                      </span>
                    )}
                  </div>

                  <button type="button" className="min-h-[44px] min-w-[44px] p-2.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {acct.notes && (
              <p className="text-xs text-muted-foreground mt-4 px-1">{acct.notes}</p>
            )}
          </div>
        </div>

        {/* ── Right panel — desktop only ─────────────────────── */}
        <div className="hidden lg:block px-5 py-6 space-y-5 sticky top-0">

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick actions</p>
            <div className="space-y-2">
              {canRecordManualPayment && (
                <Button
                  className="w-full bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-semibold"
                  onClick={openRecordPayment}
                >
                  <DollarSign className="h-4 w-4 mr-1.5" />
                  Record payment
                </Button>
              )}

              {customer && (
                <Link href={`/customers/${customer.id}?action=send-pay-link`} className="block">
                  <Button variant="outline" className="w-full">
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Send pay link
                  </Button>
                </Link>
              )}

              {customer && (
                <Link href={`/customers/${customer.id}`} className="block">
                  <Button variant="ghost" className="w-full text-muted-foreground">
                    <History className="h-4 w-4 mr-1.5" />
                    Payment history
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {isOverdue && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-[10px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {Math.abs(daysUntilNext)} day{Math.abs(daysUntilNext) !== 1 ? 's' : ''} overdue
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {fmt(acct.monthly_payment)} payment is {Math.abs(daysUntilNext)} days past due.
                Try a pay link or phone reminder.
              </p>
              {canRecordManualPayment && acct.status === 'active' ? (
                <Button
                  size="sm"
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  onClick={openRecordPayment}
                >
                  Record payment
                </Button>
              ) : customer ? (
                <Link href={`/customers/${customer.id}?action=send-pay-link`} className="block">
                  <Button size="sm" variant="outline" className="w-full">
                    Send pay link
                  </Button>
                </Link>
              ) : null}
            </div>
          )}

          <div className="bg-card border border-border rounded-[10px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Next payment</p>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
              {nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {daysUntilNext > 0
                ? `In ${daysUntilNext} days`
                : daysUntilNext === 0 ? 'Due today'
                : `${Math.abs(daysUntilNext)} days past due`}
              {acct.sms_consent ? ' · Auto-debit on file' : ''}
            </p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="text-base font-bold text-[var(--brand-orange)]">{fmt(acct.monthly_payment)}</span>
            </div>
          </div>

          {customer && (
            <div className="bg-card border border-border rounded-[10px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
              <div className="space-y-2">
                {customer.primary_phone && (
                  <a href={`tel:${customer.primary_phone}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    {customer.primary_phone}
                  </a>
                )}
                {(customer.email || acct.customer_email) && (
                  <a href={`mailto:${customer.email ?? acct.customer_email}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors truncate">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{customer.email ?? acct.customer_email}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reminder funnel</p>
              <span className="text-xs text-muted-foreground">{recentReminderLog.length} recent</span>
            </div>

            {recentReminderLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment reminders logged yet.</p>
            ) : (
              <div className="space-y-3">
                {recentReminderLog.map(log => {
                  const outcome = deriveReminderOutcome(log)
                  return (
                    <div key={log.id} className="rounded-lg border border-border px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {reminderLabel(log.reminder_type)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {log.channel.toUpperCase()} • scheduled {formatTimestampShort(log.scheduled_for)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses(outcome)}`}>
                          {outcome}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{log.sent_at ? 'Sent' : 'Not sent'}</span>
                        {log.delivered_at ? <span>Delivered</span> : null}
                        {log.clicked_at ? <span>Clicked{log.click_count > 1 ? ` ${log.click_count}x` : ''}</span> : null}
                        {log.paid_at ? <span>Paid</span> : null}
                        {log.delivery_status && !log.delivered_at && !log.clicked_at && !log.paid_at ? (
                          <span>Provider: {log.delivery_status}</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky bottom bar — mobile only ───────────────────── */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-card border-t border-border px-4 py-3 pb-safe">
        <div className="space-y-2">
          {canRecordManualPayment && (
            <Button
              className="w-full bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-semibold h-11"
              onClick={openRecordPayment}
            >
              <DollarSign className="h-4 w-4 mr-1.5" />
              Record payment
            </Button>
          )}
          <div className="flex gap-2">
            {customer && (
              <Link href={`/customers/${customer.id}?action=send-pay-link`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full h-11 min-h-[44px]">
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Send pay link
                </Button>
              </Link>
            )}
            {customer && (
              <Link href={`/customers/${customer.id}`} className="flex-1">
                <Button variant="ghost" size="sm" className="w-full h-11 min-h-[44px] text-muted-foreground">
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  History
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
