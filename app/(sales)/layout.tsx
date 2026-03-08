import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { getChannelRepCode, isPlatformSuperAdmin } from '@/lib/auth/platform'

/**
 * Guard: only channel_reps (and platform super admins for preview) may access /sales.
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()

  // Platform super admins can preview the sales portal
  if (await isPlatformSuperAdmin(profile.id)) {
    return <>{children}</>
  }

  const code = await getChannelRepCode(profile.id)
  if (!code) redirect('/today')

  return <>{children}</>
}
