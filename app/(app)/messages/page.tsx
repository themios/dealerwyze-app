import { requireProfile } from '@/lib/auth/profile'
import MessagesClient from './MessagesClient'
import PushRegistration from '@/components/push/PushRegistration'

export default async function MessagesPage() {
  const profile = await requireProfile()
  return (
    <>
      <PushRegistration />
      <MessagesClient orgId={profile.org_id} />
    </>
  )
}
