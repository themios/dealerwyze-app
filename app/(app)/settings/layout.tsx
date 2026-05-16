import { requireProfile } from '@/lib/auth/profile'
import SettingsMobileNav from '@/components/settings/SettingsMobileNav'
import type { UserRole } from '@/types/index'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const canManageReconTemplate = profile.role === 'dealer_admin' || profile.role === 'admin'

  return (
    <div className="relative min-h-dvh">
      {children}
      <SettingsMobileNav
        role={profile.role as UserRole}
        canManageReconTemplate={canManageReconTemplate}
      />
    </div>
  )
}
