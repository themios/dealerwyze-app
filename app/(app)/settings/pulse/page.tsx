// app/(app)/settings/pulse/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PulseSettingsClient from './PulseSettingsClient'

export default async function PulseSettingsPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) redirect('/settings')
  return (
    <div>
      <TopBar title="Customer Pulse" />
      <PulseSettingsClient />
    </div>
  )
}
