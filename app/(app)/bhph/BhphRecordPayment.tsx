'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, History } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  accountId: string
  monthlyPayment: number
  customerId?: string
}

function localTodayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function BhphRecordPayment({
  accountId,
  monthlyPayment,
  customerId,
}: Props) {
  const [amount, setAmount] = useState(monthlyPayment.toString())
  const [paymentDate, setPaymentDate] = useState(localTodayYmd)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function recordPayment() {
    const paid = parseFloat(amount)
    if (!Number.isFinite(paid) || paid <= 0) {
      toast.error('Enter an amount greater than zero.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      toast.error('Invalid payment date.')
      return
    }
    if (paymentDate > localTodayYmd()) {
      toast.error('Payment date cannot be in the future.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/bhph/${accountId}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: paid,
            paymentDate,
            paymentType: 'regular',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(typeof data.error === 'string' ? data.error : 'Could not record payment')
          return
        }
        toast.success(data.paidOff ? 'Payment recorded — contract paid off' : 'Payment recorded')
        setShowForm(false)
        router.refresh()
      } catch {
        toast.error('Could not record payment')
      }
    })
  }

  if (showForm) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Payment date</Label>
          <Input
            type="date"
            value={paymentDate}
            max={localTodayYmd()}
            onChange={e => setPaymentDate(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-10 tabular-nums"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={recordPayment}
            disabled={isPending}
            className="flex-1 h-10 bg-[#0D2B55] text-white hover:bg-[#0D2B55]/90"
          >
            {isPending ? 'Recording…' : 'Record'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowForm(false)}
            disabled={isPending}
            className="h-10 text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-1">
      <Button
        size="sm"
        className="w-full h-11 min-h-[44px] bg-[#0D2B55] text-white hover:bg-[#0D2B55]/90"
        onClick={() => setShowForm(true)}
      >
        <CheckCircle className="h-4 w-4 mr-1.5" />
        Record Payment
      </Button>

      <Link href={`/bhph/${accountId}`} className="block w-full">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-11 min-h-[44px] text-xs"
        >
          Full account & payment history
        </Button>
      </Link>

      {customerId && (
        <Link href={`/customers/${customerId}?action=send-pay-link`} className="block w-full">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-11 min-h-[44px] bg-[#EDE8E0] text-[#0D2B55] border-[#DDD8CF] hover:bg-[#DDD8CF]"
          >
            Send Pay Link
          </Button>
        </Link>
      )}

      {customerId && (
        <Link href={`/customers/${customerId}`} className="block w-full">
          <Button size="sm" variant="ghost" className="w-full h-11 min-h-[44px] text-muted-foreground text-xs">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Customer profile
          </Button>
        </Link>
      )}
    </div>
  )
}
