import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import GeneralSettingsClient from '@/components/admin/settings/general/GeneralSettingsClient'

export const dynamic = 'force-dynamic'

const REALTY_HOSTS = ['realtywyze.us', 'realtywyze.localhost']

export default async function PlatformGeneralSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)

  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const hdrs = await headers()
  const host = hdrs.get('host') ?? ''
  const vertical = REALTY_HOSTS.some(h => host.includes(h)) ? 'real_estate' : 'dealer'

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('vertical', vertical)
    .maybeSingle()

  return <GeneralSettingsClient initialData={row ?? {}} />
}
