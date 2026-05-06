export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import BhphDetailClient from './BhphDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function BhphDetailPage({ params }: Props) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) redirect('/today')

  const supabase = await createClientForRequest()

  const { data: acct } = await supabase
    .from('bhph_payments')
    .select(`
      *,
      vehicle:vehicles(id, year, make, model, stock_no, vin),
      customer:customers(id, name, primary_phone, email, sms_opt_out)
    `)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!acct) notFound()

  // Fetch recent reminder log for payment history context
  const { data: reminderLog } = await supabase
    .from('payment_reminder_log')
    .select('id, reminder_type, channel, status, delivery_status, scheduled_for, sent_at, delivered_at, clicked_at, click_count, paid_at, created_at')
    .eq('bhph_id', id)
    .order('scheduled_for', { ascending: false })
    .limit(50)

  const { data: deferredPayments } = await supabase
    .from('bhph_deferred_payments')
    .select('*')
    .eq('bhph_id', id)
    .eq('user_id', profile.org_id)
    .order('due_date', { ascending: true })

  const canRecordManualPayment =
    profile.role === 'dealer_admin' || profile.role === 'dealer_manager'

  const { data: achMethodRow } = await supabase
    .from('bhph_payment_methods')
    .select('bank_name, last4, verification_status')
    .eq('bhph_id', id)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <BhphDetailClient
        account={acct}
        reminderLog={reminderLog ?? []}
        deferredPayments={deferredPayments ?? []}
        canRecordManualPayment={canRecordManualPayment}
        defaultAchMethod={achMethodRow}
      />
    </Suspense>
  )
}
