import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import NotificationsClient from '@/components/admin/settings/notifications/NotificationsClient'

export const dynamic = 'force-dynamic'

export default async function NotificationsSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('platform_notification_config')
    .select('*')
    .limit(1)
    .maybeSingle()

  return <NotificationsClient initialData={row ?? {}} />
}
