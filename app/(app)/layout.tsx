export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { headers, cookies } from 'next/headers'
import BottomNav from '@/components/layout/BottomNav'
import PushPermission from '@/components/push/PushPermission'
import PastDueBanner from '@/components/layout/PastDueBanner'
import ImpersonationBanner from '@/components/admin/ImpersonationBanner'
import { isDealerAdmin } from '@/types/index'
import { getStaffOrgOverride } from '@/lib/auth/staffSession'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, platform_role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const pathname = (await headers()).get('x-pathname') ?? ''

  // Platform staff and superadmins bypass all gates
  const isPlatformUser = profile.platform_role === 'platform_staff' ||
    (await (async () => {
      const service = createServiceClient()
      const { data } = await service.from('platform_superusers').select('user_id').eq('user_id', user.id).maybeSingle()
      return !!data
    })())

  if (!isPlatformUser) {
    // Gate 1: Onboarding wizard — redirect new dealers if not yet completed
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('onboarding_completed_at')
      .eq('org_id', profile.org_id ?? '')
      .maybeSingle()

    if (orgSettings && orgSettings.onboarding_completed_at === null && !pathname.startsWith('/onboarding')) {
      redirect('/onboarding')
    }

    // Gate 2: Approval check — dealer admins must be approved before accessing app
    if (isDealerAdmin(profile.role) && !pathname.startsWith('/pending')) {
      const service = createServiceClient()
      const { data: org } = await service
        .from('organizations')
        .select('approved_at')
        .eq('id', profile.org_id ?? '')
        .single()

      if (org && !org.approved_at) {
        redirect('/pending')
      }
    }
  }

  // Check for platform staff impersonation session
  let impersonationOrgName: string | null = null
  if (isPlatformUser) {
    const cookieStore = await cookies()
    const staffOrgId = getStaffOrgOverride(cookieStore)
    if (staffOrgId) {
      const service = createServiceClient()
      const { data: impOrg } = await service
        .from('organizations')
        .select('name')
        .eq('id', staffOrgId)
        .single()
      impersonationOrgName = impOrg?.name ?? null
    }
  }

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto relative">
      {impersonationOrgName && (
        <ImpersonationBanner orgName={impersonationOrgName} />
      )}
      <PushPermission />
      <main className="flex-1 overflow-y-auto pb-20">
        <PastDueBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
