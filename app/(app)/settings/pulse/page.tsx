// app/(app)/settings/pulse/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import PulseSettingsClient from './PulseSettingsClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function PulseSettingsPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) redirect('/settings')
  return (
    <SettingsPageShell
      title="Post-Sale Outreach"
      description="Review requests, surveys, and sold-customer follow-up behavior."
      type="form"
    >
      <PulseSettingsClient />
    </SettingsPageShell>
  )
}
