import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessBilling } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  if (!canAccessBilling(profile.role as UserRole)) {
    redirect('/settings')
  }
  return <>{children}</>
}
