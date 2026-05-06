export const dynamic = 'force-dynamic'

import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { headers, cookies } from 'next/headers'
import BottomNav from '@/components/layout/BottomNav'
import DesktopSidebar from '@/components/layout/DesktopSidebar'
import PushPermission from '@/components/push/PushPermission'
import PastDueBanner from '@/components/layout/PastDueBanner'
import ImpersonationBanner from '@/components/admin/ImpersonationBanner'
import SupportSessionBanner from '@/components/layout/SupportSessionBanner'
import FeedbackButton from '@/components/layout/FeedbackButton'
import { isDealerAdmin } from '@/types/index'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { getOrgTheme, buildThemeStyleTag } from '@/lib/theme/getOrgTheme'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'

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

  // platform check — lib/auth/platform.ts
  // Platform staff and superadmins bypass all gates
  const isSuperAdmin = await isPlatformSuperAdmin(user.id)
  const isPlatformUser = profile.platform_role === 'platform_staff' || isSuperAdmin

  if (!isPlatformUser) {
    const isAdmin = isDealerAdmin(profile.role)

    // Gate 1: Onboarding wizard — only dealer admins are forced through setup.
    // Staff and sales reps can go straight into the app even if onboarding isn't complete.
    if (isAdmin) {
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('onboarding_completed_at')
        .eq('org_id', profile.org_id ?? '')
        .maybeSingle()

      if (orgSettings && orgSettings.onboarding_completed_at === null && !pathname.startsWith('/onboarding')) {
        redirect('/onboarding')
      }
    }

    // Gate 2: Approval check — dealer admins must be approved before accessing app
    if (isAdmin && !pathname.startsWith('/pending')) {
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

  // Fetch org theme for CSS var injection
  const effectiveOrgId = profile.org_id
  const orgTheme = await getOrgTheme(effectiveOrgId)
  const themeStyle = buildThemeStyleTag(orgTheme.vars)

  // Lora and Oswald are NOT loaded globally — inject only when the org uses that font style.
  // This avoids ~200KB of font downloads for the majority of users on the default "modern" theme.
  const orgFontLinks: React.ReactNode =
    orgTheme.fontStyle === 'classic' ? (
      <>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap" rel="stylesheet" />
      </>
    ) : orgTheme.fontStyle === 'bold' ? (
      <>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </>
    ) : null

  // Check for platform staff impersonation session
  let impersonationOrgName: string | null = null
  let impersonationWriteMode = false
  let orgName: string | null = null

  // Fetch org name for desktop sidebar
  if (profile.org_id) {
    const service = createServiceClient()
    const { data: orgRow } = await service
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .maybeSingle()
    orgName = orgRow?.name ?? null
  }

  if (isPlatformUser) {
    const cookieStore = await cookies()
    const session = getStaffSessionInfo(cookieStore)
    if (session) {
      const service = createServiceClient()
      const { data: impOrg } = await service
        .from('organizations')
        .select('name')
        .eq('id', session.orgId)
        .single()
      impersonationOrgName  = impOrg?.name ?? null
      impersonationWriteMode = session.writeMode
      orgName = impersonationOrgName // show impersonated org in sidebar
    }
  }

  return (
    // Mobile: single-column, max-w-md centered
    // Desktop (lg+): full-width flex row — sidebar + content
    <>
      {orgFontLinks}
      {themeStyle && (
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      )}
    <div className={`flex h-dvh w-full lg:max-w-none max-w-md mx-auto relative font-style-${orgTheme.fontStyle}`}>
      {/* Desktop sidebar — hidden on mobile */}
      <DesktopSidebar orgName={orgName} />

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        {impersonationOrgName && (
          <ImpersonationBanner orgName={impersonationOrgName} writeMode={impersonationWriteMode} />
        )}
        {!isPlatformUser && <SupportSessionBanner />}
        <PushPermission />
        {/* pb-20 on mobile for BottomNav; no padding needed on desktop */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0" suppressHydrationWarning>
          <PastDueBanner />
          {children}
        </main>
        {/* BottomNav — hidden on desktop */}
        <BottomNav />
        <FeedbackButton />
      </div>
    </div>
    </>
  )
}
