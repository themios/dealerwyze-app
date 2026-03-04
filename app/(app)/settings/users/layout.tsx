import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export default async function UsersSettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    redirect('/settings')
  }
  return <>{children}</>
}
