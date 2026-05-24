import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import BillingQuotasClient from '@/components/admin/settings/billing/BillingQuotasClient'

export const dynamic = 'force-dynamic'

export default async function BillingSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('platform_plan_quotas')
    .select('*')
    .order('plan')

  return <BillingQuotasClient quotas={data ?? []} />
}
