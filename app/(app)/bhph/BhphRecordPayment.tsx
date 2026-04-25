'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, History } from 'lucide-react'
import { nextDueDate } from '@/lib/bhph/schedule'
import type { PaymentFrequency } from '@/lib/bhph/schedule'
import Link from 'next/link'

interface Props {
  accountId: string
  monthlyPayment: number
  paymentFrequency: PaymentFrequency
  paymentDayAnchor: number
  currentDueDate: string
  loanAmount?: number | null
  totalPaid: number
  customerId?: string
  accountBalance?: number | null
}

export default function BhphRecordPayment({
  accountId, monthlyPayment, paymentFrequency, paymentDayAnchor,
  currentDueDate, loanAmount, totalPaid, customerId, accountBalance,
}: Props) {
  const [amount, setAmount] = useState(monthlyPayment.toString())
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function recordPayment() {
    startTransition(async () => {
      const supabase = createClient()
      const paid = parseFloat(amount)
      if (!paid) return

      const newTotal = totalPaid + paid
      const paidOff = loanAmount != null && newTotal >= loanAmount

      const next = nextDueDate(currentDueDate, paymentFrequency, paymentDayAnchor)

      await supabase
        .from('bhph_payments')
        .update({
          total_paid: newTotal,
          next_due_date: next,
          status: paidOff ? 'paid_off' : 'active',
          // Reset reminder stage so the next cycle fires fresh
          last_reminder_type: null,
          last_reminder_at: null,
          reminder_sequence_status: paidOff ? 'completed' : 'active',
        })
        .eq('id', accountId)

      // Cancel any pending reminders for this cycle
      await supabase
        .from('payment_reminder_log')
        .update({ status: 'cancelled' })
        .eq('bhph_id', accountId)
        .eq('status', 'pending')

      setShowForm(false)
      router.refresh()
    })
  }

  if (showForm) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="h-9 text-sm"
        />
        <Button
          size="sm"
          onClick={recordPayment}
          disabled={isPending}
          className="flex-shrink-0 bg-[#0D2B55] text-white hover:bg-[#0D2B55]/90"
        >
          {isPending ? '…' : 'Record'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="flex-shrink-0 text-muted-foreground">
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-1">
      {/* Primary: Record Payment */}
      <Button
        size="sm"
        className="w-full bg-[#0D2B55] text-white hover:bg-[#0D2B55]/90"
        onClick={() => setShowForm(true)}
      >
        <CheckCircle className="h-4 w-4 mr-1.5" />
        Record Payment
      </Button>

      {/* Secondary: Send Pay Link */}
      {customerId && (
        <Link href={`/customers/${customerId}?action=send-pay-link`} className="block w-full">
          <Button
            size="sm"
            variant="outline"
            className="w-full bg-[#EDE8E0] text-[#0D2B55] border-[#DDD8CF] hover:bg-[#DDD8CF]"
          >
            Send Pay Link
          </Button>
        </Link>
      )}

      {/* Ghost: Payment History */}
      {customerId && (
        <Link href={`/customers/${customerId}`} className="block w-full">
          <Button size="sm" variant="ghost" className="w-full text-muted-foreground text-xs">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Payment History
          </Button>
        </Link>
      )}
    </div>
  )
}
