import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import TopBar from '@/components/layout/TopBar'
import { Loader2 } from 'lucide-react'

const PipelineBoard = dynamic(() => import('./PipelineBoard'), {
  loading: () => (
    <div className="flex justify-center items-center min-h-96">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
  ssr: false
})

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, primary_phone, thread_state, lead_state_changed_at, created_at, lead_source')
    .eq('user_id', profile.org_id)
    .or('archived.is.null,archived.eq.false')
    .order('lead_state_changed_at', { ascending: false, nullsFirst: true })

  return (
    <div>
      <TopBar title="Pipeline" />
      <Suspense fallback={
        <div className="flex justify-center items-center min-h-96">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }>
        <PipelineBoard customers={customers ?? []} />
      </Suspense>
    </div>
  )
}
