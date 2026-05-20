import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { redirect } from 'next/navigation'
import AdminInboxClient from './AdminInboxClient'

export default async function AdminInboxPage() {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return redirect('/admin')
  return <AdminInboxClient />
}
