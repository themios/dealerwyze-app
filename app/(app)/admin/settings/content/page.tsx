import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import ContentPipelineClient from '@/components/admin/settings/content/ContentPipelineClient'

export const dynamic = 'force-dynamic'

export default async function PlatformContentSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('platform_content_config')
    .select('*')
    .limit(1)
    .maybeSingle()

  return <ContentPipelineClient initialData={row ?? {}} />
}
