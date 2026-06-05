export const dynamic = 'force-dynamic'

import nextDynamic from 'next/dynamic'
import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBhph, canRecordBhphPayment } from '@/lib/auth/dealerRoles'
import { ensureBhphContractFinance } from '@/lib/bhph/ensureContractFinance'
import type { UserRole } from '@/types/index'
import { Loader2 } from 'lucide-react'


const BhphDetailClient = nextDynamic(() => import('./BhphDetailClient'), {
  loading: () => (
    <div className="flex justify-center items-center min-h-96">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

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
      created_at,
      vehicle:vehicles(id, year, make, model, stock_no, vin),
      customer:customers(id, name, primary_phone, email, sms_opt_out)
    `)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!acct) notFound()

  try {
    const service = createServiceClient()
    const repaired = await ensureBhphContractFinance(service, id, profile.org_id)
    if (repaired.ok && repaired.repaired) {
      const { data: refreshed } = await supabase
        .from('bhph_payments')
        .select(`
          *,
          created_at,
          vehicle:vehicles(id, year, make, model, stock_no, vin),
          customer:customers(id, name, primary_phone, email, sms_opt_out)
        `)
        .eq('id', id)
        .eq('user_id', profile.org_id)
        .maybeSingle()
      if (refreshed) {
        Object.assign(acct, refreshed)
      }
    }
  } catch (e) {
    console.error('[bhph/detail] auto finance repair:', e)
  }

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

  const canRecordManualPayment = canRecordBhphPayment(profile.role as UserRole)

  const { data: achMethodRow } = await supabase
    .from('bhph_payment_methods')
    .select('bank_name, last4, verification_status')
    .eq('bhph_id', id)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-96">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    }>
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
