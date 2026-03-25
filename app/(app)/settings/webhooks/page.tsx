import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { ChevronLeft } from 'lucide-react'
import WebhooksClient from './WebhooksClient'

export default async function WebhooksPage() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/settings')

  const supabase = createServiceClient()
  const { data: webhooks } = await supabase
    .from('org_webhooks')
    .select('id, url, events, active, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  const back = (
    <Link href="/settings" className="flex items-center gap-1 text-white text-sm">
      <ChevronLeft className="h-4 w-4" />
      Settings
    </Link>
  )

  return (
    <div>
      <TopBar title="Webhooks" left={back} />
      <div className="px-4 py-4">
        <WebhooksClient initialWebhooks={webhooks ?? []} />
      </div>
    </div>
  )
}
