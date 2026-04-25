export const dynamic = 'force-dynamic'

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
      customer:customers(id, name, primary_phone, email, sms_opted_out)
    `)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!acct) notFound()

  // Fetch recent reminder log for payment history context
  const { data: reminderLog } = await supabase
    .from('payment_reminder_log')
    .select('id, reminder_type, channel, status, scheduled_for, sent_at, created_at')
    .eq('bhph_id', id)
    .order('scheduled_for', { ascending: false })
    .limit(50)

  return (
    <BhphDetailClient
      account={acct}
      reminderLog={reminderLog ?? []}
    />
  )
}
