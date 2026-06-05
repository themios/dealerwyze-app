'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { Percent, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatAprFromStored,
  storedRateToPercentInputValue,
} from '@/lib/bhph/contractTerms'
import type { PaymentFrequency } from '@/lib/bhph/schedule'

export type BhphContractTermsInitial = {
  interest_rate: number | null
  monthly_payment: number
  payment_frequency: string
  payment_day_anchor: number | null
  notes: string | null
}

interface Props {
  contractId: string
  initial: BhphContractTermsInitial
  readOnly?: boolean
}

export default function BhphContractTermsPanel({ contractId, initial, readOnly }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [aprPercent, setAprPercent] = useState(() => storedRateToPercentInputValue(initial.interest_rate))
  const [monthlyPayment, setMonthlyPayment] = useState(String(initial.monthly_payment ?? ''))
  const [frequency, setFrequency] = useState<PaymentFrequency>(
    (initial.payment_frequency as PaymentFrequency) || 'monthly',
  )
  const [paymentDay, setPaymentDay] = useState(
    String(initial.payment_day_anchor ?? 1),
  )
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function resetForm() {
    setAprPercent(storedRateToPercentInputValue(initial.interest_rate))
    setMonthlyPayment(String(initial.monthly_payment ?? ''))
    setFrequency((initial.payment_frequency as PaymentFrequency) || 'monthly')
    setPaymentDay(String(initial.payment_day_anchor ?? 1))
    setNotes(initial.notes ?? '')
    setError(null)
  }

  function startEdit() {
    resetForm()
    setEditing(true)
  }

  function cancelEdit() {
    resetForm()
    setEditing(false)
  }

  function save() {
    setError(null)
    const pmt = parseFloat(monthlyPayment)
    if (!Number.isFinite(pmt) || pmt <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    const day = parseInt(paymentDay, 10)
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setError('Payment day must be between 1 and 31.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/bhph/${contractId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            annual_interest_rate_percent: aprPercent === '' ? 0 : aprPercent,
            monthly_payment: pmt,
            payment_frequency: frequency,
            payment_day: day,
            notes: notes.trim() || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const detail = typeof data.detail === 'string' ? data.detail : ''
          const base = typeof data.error === 'string' ? data.error : 'Could not save'
          setError(detail ? `${base}: ${detail}` : base)
          return
        }
        const rebuilt = data.rebuild as { paymentsUpdated?: number; totalInterestPaid?: number } | undefined
        if (rebuilt?.paymentsUpdated != null && rebuilt.paymentsUpdated > 0) {
          toast.success(
            `Contract terms saved. Recalculated interest on ${rebuilt.paymentsUpdated} payment(s).`,
          )
        } else {
          toast.success('Contract terms saved.')
        }
        setEditing(false)
        router.refresh()
      } catch {
        setError('Could not save contract terms.')
      }
    })
  }

  const freqLabel =
    initial.payment_frequency === 'weekly'
      ? 'Weekly'
      : initial.payment_frequency === 'biweekly'
        ? 'Bi-weekly'
        : 'Monthly'

  return (
    <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contract terms
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Interest rate and payment schedule — used when recording payments
            </p>
          </div>
        </div>
        {!readOnly && !editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit terms
          </Button>
        )}
      </div>

      {!editing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Interest rate</p>
            <p className="font-semibold text-foreground tabular-nums">
              {formatAprFromStored(initial.interest_rate)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Payment</p>
            <p className="font-semibold text-foreground tabular-nums">
              {initial.monthly_payment.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Frequency</p>
            <p className="font-medium text-foreground">{freqLabel}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Due day</p>
            <p className="font-medium text-foreground tabular-nums">
              {initial.payment_day_anchor ?? '—'}
            </p>
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bhph-apr">Annual interest rate (%)</Label>
              <Input
                id="bhph-apr"
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="23.99"
                value={aprPercent}
                onChange={(e) => setAprPercent(e.target.value)}
                className="h-11"
              />
              <p className="text-[11px] text-muted-foreground">
                Simple daily accrual on principal balance (365-day year).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bhph-pmt">Scheduled payment</Label>
              <Input
                id="bhph-pmt"
                type="number"
                min={0}
                step="0.01"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as PaymentFrequency)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bhph-day">Payment day (1–31)</Label>
              <Input
                id="bhph-day"
                type="number"
                min={1}
                max={31}
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bhph-notes">Notes</Label>
            <Textarea
              id="bhph-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={pending}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white"
              onClick={save}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save terms'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
