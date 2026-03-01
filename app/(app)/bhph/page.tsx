export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MessageSquare, Mail } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import BhphRecordPayment from './BhphRecordPayment'
import type { PaymentFrequency } from '@/lib/bhph/schedule'

export default async function BhphPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('bhph_payments')
    .select(`
      *,
      vehicle:vehicles(id, year, make, model, stock_no),
      customer:customers(id, name, primary_phone, sms_opted_out)
    `)
    .eq('user_id', profile.org_id)
    .eq('status', 'active')
    .order('next_due_date', { ascending: true })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div>
      <TopBar title="BHPH Accounts" />

      {accounts && accounts.length > 0 && (
        <div className="px-4 py-3 border-b">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0D2B55]/5 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-[#0D2B55]">{accounts.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active</p>
            </div>
            <div className="bg-destructive/5 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-destructive">
                {accounts.filter((a: any) => {
                  const d = new Date(a.next_due_date + 'T12:00:00')
                  const t = new Date(); t.setHours(0,0,0,0)
                  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)) < 0
                }).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Overdue</p>
            </div>
            <div className="bg-[#F5A623]/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-[#92560A]">
                {accounts.filter((a: any) => {
                  const d = new Date(a.next_due_date + 'T12:00:00')
                  const t = new Date(); t.setHours(0,0,0,0)
                  const days = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
                  return days >= 0 && days <= 3
                }).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Due Soon</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 space-y-4">
        {!accounts || accounts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">💳</p>
            <p className="font-medium">No active BHPH accounts</p>
            <p className="text-sm mt-1">Mark a vehicle as sold with BHPH financing to track payments here.</p>
          </div>
        ) : (
          accounts.map((acct: any) => {
            const dueDate = new Date(acct.next_due_date + 'T12:00:00')
            const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            const isOverdue = daysUntil < 0
            const isDueSoon = daysUntil >= 0 && daysUntil <= 3
            const freqLabel = acct.payment_frequency === 'weekly' ? 'Weekly'
              : acct.payment_frequency === 'biweekly' ? 'Bi-weekly' : 'Monthly'

            return (
              <div key={acct.id} className="border rounded-xl p-4 bg-card space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/customers/${acct.customer?.id}`}>
                      <p className="font-semibold text-primary">{acct.customer?.name}</p>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {acct.vehicle?.year} {acct.vehicle?.make} {acct.vehicle?.model}
                      {acct.vehicle?.stock_no && <span className="ml-1 text-xs">#{acct.vehicle.stock_no}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{freqLabel} payments</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                    isOverdue
                      ? 'bg-destructive/10 text-destructive'
                      : isDueSoon
                        ? 'bg-yellow-500/10 text-yellow-600'
                        : 'bg-green-500/10 text-green-600'
                  }`}>
                    {isOverdue
                      ? `${Math.abs(daysUntil)}d overdue`
                      : daysUntil === 0 ? 'Due today'
                      : `Due in ${daysUntil}d`}
                  </span>
                </div>

                {/* Payment stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Payment</p>
                    <p className="font-bold text-sm">{formatCurrency(acct.monthly_payment)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="font-bold text-sm">{formatCurrency(acct.total_paid)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="font-bold text-sm">
                      {acct.loan_amount
                        ? formatCurrency(Math.max(0, acct.loan_amount - acct.total_paid))
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Due date + contact */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Next due: {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {acct.customer?.primary_phone && (
                    <a href={`tel:${acct.customer.primary_phone}`} className="text-primary font-medium">
                      Call
                    </a>
                  )}
                </div>

                {/* Reminder consent badges */}
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                    acct.sms_consent && !acct.customer?.sms_opted_out
                      ? 'bg-green-500/10 text-green-700'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <MessageSquare className="h-3 w-3" />
                    SMS {acct.sms_consent && !acct.customer?.sms_opted_out ? 'on' : acct.customer?.sms_opted_out ? 'opted out' : 'off'}
                  </span>
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                    acct.email_consent ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Mail className="h-3 w-3" />
                    Email {acct.email_consent ? 'on' : 'off'}
                  </span>
                  {acct.last_reminder_type && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Last: {acct.last_reminder_type.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <BhphRecordPayment
                  accountId={acct.id}
                  monthlyPayment={acct.monthly_payment}
                  paymentFrequency={(acct.payment_frequency ?? 'monthly') as PaymentFrequency}
                  paymentDayAnchor={acct.payment_day_anchor ?? acct.payment_day_of_month ?? 1}
                  currentDueDate={acct.next_due_date}
                  loanAmount={acct.loan_amount}
                  totalPaid={acct.total_paid ?? 0}
                />

                {acct.notes && (
                  <p className="text-xs text-muted-foreground border-t pt-2">{acct.notes}</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
