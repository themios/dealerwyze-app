'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle } from 'lucide-react'
import { nextDueDate } from '@/lib/bhph/schedule'
import type { PaymentFrequency } from '@/lib/bhph/schedule'

interface Props {
  accountId: string
  monthlyPayment: number
  paymentFrequency: PaymentFrequency
  paymentDayAnchor: number
  currentDueDate: string
  loanAmount?: number | null
  totalPaid: number
}

export default function BhphRecordPayment({
  accountId, monthlyPayment, paymentFrequency, paymentDayAnchor,
  currentDueDate, loanAmount, totalPaid,
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
        <Button size="sm" onClick={recordPayment} disabled={isPending} className="flex-shrink-0">
          {isPending ? '…' : 'Record'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="flex-shrink-0">
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button size="sm" variant="outline" className="w-full border-[#F07018] text-[#F07018] hover:bg-[#F07018]/10" onClick={() => setShowForm(true)}>
      <CheckCircle className="h-4 w-4 mr-1.5" />
      Record Payment
    </Button>
  )
}
