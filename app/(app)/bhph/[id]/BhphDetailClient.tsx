'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import TopBar from '@/components/layout/TopBar'
import { formatCurrency } from '@/lib/utils'
import { nextDueDate } from '@/lib/bhph/schedule'
import type { PaymentFrequency } from '@/lib/bhph/schedule'
import {
  CheckCircle, AlertTriangle, ChevronLeft, Phone, Mail,
  History, Link2, DollarSign, MoreVertical,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────

interface Account {
  id: string
  loan_amount: number | null
  total_paid: number
  down_payment: number
  monthly_payment: number
  payment_frequency: string
  payment_day_anchor: number | null
  next_due_date: string
  frequency_anchor_date: string | null
  sms_consent: boolean
  email_consent: boolean
  notes: string | null
  status: string
  customer_email: string | null
  customer: { id: string; name: string; primary_phone: string; email: string | null; sms_opted_out: boolean } | null
  vehicle: { id: string; year: number; make: string; model: string; stock_no: string | null; vin: string | null } | null
}

interface ReminderLog {
  id: string
  reminder_type: string
  channel: string
  status: string
  scheduled_for: string
  sent_at: string | null
}

interface Props {
  account: Account
  reminderLog: ReminderLog[]
}

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/**
 * Reconstruct the payment schedule backwards from next_due_date.
 * We know total_paid / monthly_payment = number of payments made.
 */
function buildSchedule(acct: Account) {
  const freq = (acct.payment_frequency ?? 'monthly') as PaymentFrequency
  const anchor = acct.payment_day_anchor ?? undefined
  const pmtAmount = acct.monthly_payment
  const loanAmount = acct.loan_amount ?? 0
  const totalPayments = loanAmount > 0 ? Math.ceil(loanAmount / pmtAmount) : 24
  const paymentsMade = Math.floor((acct.total_paid ?? 0) / pmtAmount)

  // Build list of due dates going back from next_due_date
  const dates: string[] = []
  let current = acct.next_due_date

  // next_due_date is the NEXT payment — go backwards to reconstruct history
  for (let i = 0; i < Math.min(paymentsMade + 4, totalPayments); i++) {
    dates.unshift(current)
    // Go backwards one period
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
  }).reverse() // newest first
}

// ── Record Payment Form ────────────────────────────────────────

function RecordPaymentForm({
  accountId, defaultAmount, paymentFrequency, paymentDayAnchor,
  currentDueDate, loanAmount, totalPaid, onClose,
}: {
  accountId: string
  defaultAmount: number
  paymentFrequency: PaymentFrequency
  paymentDayAnchor: number | null
  currentDueDate: string
  loanAmount: number | null
  totalPaid: number
  onClose: () => void
}) {
  const [amount, setAmount] = useState(defaultAmount.toString())
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function record() {
    startTransition(async () => {
      const supabase = createClient()
      const paid = parseFloat(amount)
      if (!paid) return
      const newTotal = totalPaid + paid
      const paidOff = loanAmount != null && newTotal >= loanAmount
      const next = nextDueDate(currentDueDate, paymentFrequency, paymentDayAnchor ?? undefined)
      await supabase.from('bhph_payments').update({
        total_paid: newTotal,
        next_due_date: next,
        status: paidOff ? 'paid_off' : 'active',
        last_reminder_type: null,
        last_reminder_at: null,
        reminder_sequence_status: paidOff ? 'completed' : 'active',
      }).eq('id', accountId)
      await supabase.from('payment_reminder_log')
        .update({ status: 'cancelled' })
        .eq('bhph_id', accountId)
        .eq('status', 'pending')
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        className="h-9 text-sm"
      />
      <Button size="sm" onClick={record} disabled={isPending} className="flex-shrink-0">
        {isPending ? '…' : 'Record'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose} className="flex-shrink-0 text-muted-foreground">
        Cancel
      </Button>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function BhphDetailClient({ account: acct, reminderLog }: Props) {
  const [showRecordForm, setShowRecordForm] = useState(false)

  const customer = acct.customer
  const vehicle  = acct.vehicle

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nextDue = new Date(acct.next_due_date + 'T12:00:00')
  const daysUntilNext = Math.round((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const isOverdue = daysUntilNext < 0

  const balance = acct.loan_amount != null
    ? Math.max(0, acct.loan_amount - (acct.total_paid ?? 0))
    : null

  const paidPct = acct.loan_amount && acct.loan_amount > 0
    ? Math.min(100, Math.round(((acct.total_paid ?? 0) / acct.loan_amount) * 100))
    : 0

  const totalPayments = acct.loan_amount && acct.monthly_payment
    ? Math.ceil(acct.loan_amount / acct.monthly_payment)
    : null
  const paymentsMade = acct.monthly_payment
    ? Math.floor((acct.total_paid ?? 0) / acct.monthly_payment)
    : null

  const schedule = buildSchedule(acct)

  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : 'Unknown vehicle'

  const isOnTrack = !isOverdue

  return (
    <div className="min-h-screen bg-background">
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
              {/* Avatar */}
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

          {/* Loan summary + down payment */}
          <div className="px-4 lg:px-6 py-4 space-y-3">

            {/* Loan summary card */}
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
                    {fmt(acct.total_paid)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Balance</p>
                  <p className="text-xl font-[family-name:var(--font-display)] font-bold text-[var(--brand-orange)]">
                    {fmt(balance)}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
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
            </div>

            {/* Down payment card */}
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
          </div>

          {/* Payment schedule */}
          <div className="px-4 lg:px-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[15px] text-foreground">Payment schedule</h2>
              <div className="flex items-center gap-2">
                <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">
                  All payments
                </button>
                <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table header — desktop only */}
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

                  <button className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
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

          {/* Quick actions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick actions</p>
            <div className="space-y-2">
              {showRecordForm ? (
                <RecordPaymentForm
                  accountId={acct.id}
                  defaultAmount={acct.monthly_payment}
                  paymentFrequency={(acct.payment_frequency ?? 'monthly') as PaymentFrequency}
                  paymentDayAnchor={acct.payment_day_anchor}
                  currentDueDate={acct.next_due_date}
                  loanAmount={acct.loan_amount}
                  totalPaid={acct.total_paid ?? 0}
                  onClose={() => setShowRecordForm(false)}
                />
              ) : (
                <Button
                  className="w-full bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-semibold"
                  onClick={() => setShowRecordForm(true)}
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

          {/* Overdue alert */}
          {isOverdue && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-[10px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {Math.abs(daysUntilNext)} payment{Math.abs(daysUntilNext) !== 1 ? 's' : ''} overdue
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {fmt(acct.monthly_payment)} payment is {Math.abs(daysUntilNext)} days past due.
                Try a pay link or phone reminder.
              </p>
              <Button
                size="sm"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                Start collection
              </Button>
            </div>
          )}

          {/* Next payment */}
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

          {/* Contact */}
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
        </div>
      </div>

      {/* ── Sticky bottom bar — mobile only ───────────────────── */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-card border-t border-border px-4 py-3 pb-safe">
        {showRecordForm ? (
          <RecordPaymentForm
            accountId={acct.id}
            defaultAmount={acct.monthly_payment}
            paymentFrequency={(acct.payment_frequency ?? 'monthly') as PaymentFrequency}
            paymentDayAnchor={acct.payment_day_anchor}
            currentDueDate={acct.next_due_date}
            loanAmount={acct.loan_amount}
            totalPaid={acct.total_paid ?? 0}
            onClose={() => setShowRecordForm(false)}
          />
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-semibold h-11"
              onClick={() => setShowRecordForm(true)}
            >
              <DollarSign className="h-4 w-4 mr-1.5" />
              Record payment
            </Button>
            <div className="flex gap-2">
              {customer && (
                <Link href={`/customers/${customer.id}?action=send-pay-link`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Send pay link
                  </Button>
                </Link>
              )}
              {customer && (
                <Link href={`/customers/${customer.id}`} className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground">
                    <History className="h-3.5 w-3.5 mr-1.5" />
                    History
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
