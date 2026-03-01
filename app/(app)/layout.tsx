export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/layout/BottomNav'
import PushPermission from '@/components/push/PushPermission'
import PastDueBanner from '@/components/layout/PastDueBanner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Redirect new dealers to onboarding wizard if not yet completed
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('onboarding_completed_at')
    .eq('org_id', (await supabase.from('profiles').select('org_id').eq('id', user.id).single()).data?.org_id ?? '')
    .maybeSingle()

  if (orgSettings && orgSettings.onboarding_completed_at === null) {
    redirect('/onboarding')
  }

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto relative">
      <PushPermission />
      <main className="flex-1 overflow-y-auto pb-20">
        <PastDueBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
