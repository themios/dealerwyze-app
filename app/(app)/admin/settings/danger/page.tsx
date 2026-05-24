import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import DangerZoneClient from './DangerZoneClient'

export const dynamic = 'force-dynamic'

export default async function DangerZoneSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  return <DangerZoneClient />
}
