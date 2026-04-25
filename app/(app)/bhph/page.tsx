export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MessageSquare, Mail, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import BhphRecordPayment from './BhphRecordPayment'
import type { PaymentFrequency } from '@/lib/bhph/schedule'

interface BhphAccount {
  id: string
  user_id: string
  status: string
  loan_amount: number | null
  down_payment: number | null
  total_paid: number | null
  payment_frequency: PaymentFrequency
  next_due_date: string
  sms_consent: boolean
  email_consent: boolean
  monthly_payment: number
  payment_day_anchor: number | null
  payment_day_of_month: number | null
  last_reminder_type: string | null
  notes: string | null
  vehicle: {
    id: string
    year: number | null
    make: string | null
    model: string | null
    stock_no: string | null
  } | null
  customer: {
    id: string
    name: string
    primary_phone: string | null
    sms_opted_out: boolean
  } | null
}

export default async function BhphPage() {
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) redirect('/today')
  const supabase = await createClientForRequest()

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
            <div className="bg-primary/5 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{accounts.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active</p>
            </div>
            <div className="bg-destructive/5 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-destructive">
                {accounts.filter((a: BhphAccount) => {
                  const d = new Date(a.next_due_date + 'T12:00:00')
                  const t = new Date(); t.setHours(0,0,0,0)
                  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)) < 0
                }).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Overdue</p>
            </div>
            <div className="bg-amber-500/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {accounts.filter((a: BhphAccount) => {
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
          accounts.map((acct: BhphAccount) => {
            const dueDate = new Date(acct.next_due_date + 'T12:00:00')
            const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            const isOverdue = daysUntil < 0
            const isDueSoon = daysUntil >= 0 && daysUntil <= 3
            const freqLabel = acct.payment_frequency === 'weekly' ? 'Weekly'
              : acct.payment_frequency === 'biweekly' ? 'Bi-weekly' : 'Monthly'

            const paidPct = acct.loan_amount && acct.loan_amount > 0
              ? Math.min(100, Math.round(((acct.total_paid ?? 0) / acct.loan_amount) * 100))
              : 0
            const balance = acct.loan_amount
              ? Math.max(0, acct.loan_amount - (acct.total_paid ?? 0))
              : null

            return (
              <div
                key={acct.id}
                className="bg-card border border-border rounded-[10px] p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/bhph/${acct.id}`}>
                      <p className="font-[family-name:var(--font-display)] text-[20px] font-bold leading-tight text-foreground hover:text-primary transition-colors">
                        {acct.customer?.name}
                      </p>
                    </Link>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {acct.vehicle?.year} {acct.vehicle?.make} {acct.vehicle?.model}
                      {acct.vehicle?.stock_no && <span className="ml-1">#{acct.vehicle.stock_no}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{freqLabel} payments</p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                    isOverdue
                      ? 'bg-red-100 text-red-700'
                      : daysUntil === 0
                        ? 'bg-[#FEF3E2] text-[#92560A] font-bold'
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

                {/* Loan summary stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                    <p className="text-lg font-bold text-foreground">
                      {acct.loan_amount ? formatCurrency(acct.loan_amount) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(acct.total_paid ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
                    <p className="text-lg font-bold text-[#F07018]">
                      {balance !== null ? formatCurrency(balance) : '—'}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                {acct.loan_amount && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                )}

                {/* Next due */}
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
                  customerId={acct.customer?.id}
                  accountBalance={balance}
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
