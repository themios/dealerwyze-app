export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import BookkeepingClient from '@/components/receipts/BookkeepingClient'

export default async function BookkeepingPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('*')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  return (
    <div className="pb-4">
      <TopBar title="Bookkeeping" />
      <BookkeepingClient categories={categories ?? []} />
    </div>
  )
}
