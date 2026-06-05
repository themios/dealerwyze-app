import nextDynamic from 'next/dynamic'
import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/profile'
import PushRegistration from '@/components/push/PushRegistration'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const MessagesClient = nextDynamic(() => import('./MessagesClient'), {
  loading: () => (
    <div className="flex justify-center items-center h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

export default async function MessagesPage() {
  const profile = await requireProfile()
  return (
    <>
      <PushRegistration />
      <Suspense fallback={
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }>
        <MessagesClient orgId={profile.org_id} />
      </Suspense>
    </>
  )
}
