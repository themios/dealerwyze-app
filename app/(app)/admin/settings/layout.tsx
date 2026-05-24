import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import SettingsSubNav from '@/components/admin/settings/SettingsSubNav'

export const dynamic = 'force-dynamic'

export default async function PlatformSettingsLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)

  if (!isSuperAdmin) {
    redirect('/admin')
  }

  return (
    <div className="flex h-full">
      <SettingsSubNav />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
