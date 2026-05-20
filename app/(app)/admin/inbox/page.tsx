import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { redirect } from 'next/navigation'
import AdminInboxClient from './AdminInboxClient'

export default async function AdminInboxPage() {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return redirect('/admin')
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <AdminInboxClient />
    </div>
  )
}
