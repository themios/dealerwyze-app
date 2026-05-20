import { requireProfile } from '@/lib/auth/profile'
import MessagesClient from './MessagesClient'

export default async function MessagesPage() {
  const profile = await requireProfile()
  return <MessagesClient orgId={profile.org_id} />
}
