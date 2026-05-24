import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import GeneralSettingsClient from '@/components/admin/settings/general/GeneralSettingsClient'

export const dynamic = 'force-dynamic'

export default async function PlatformGeneralSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)

  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('platform_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  return <GeneralSettingsClient initialData={row ?? {}} />
}
