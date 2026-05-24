import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import BrandContextBar from '@/components/admin/BrandContextBar'

/**
 * Guard: only platform super admins (and platform staff)
 * may access any /admin page. Org admins are redirected to /today.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const allowed = await canAccessAdminArea(profile.id)
  if (!allowed) redirect('/today')
  return (
    <>
      <BrandContextBar />
      {children}
    </>
  )
}
