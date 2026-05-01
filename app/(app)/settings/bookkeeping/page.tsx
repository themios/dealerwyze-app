export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import BookkeepingClient from '@/components/receipts/BookkeepingClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function BookkeepingPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('*')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  return (
    <SettingsPageShell
      title="Bookkeeping"
      description="Manage receipt categories and QuickBooks mapping for the ledger."
      type="form"
    >
      <BookkeepingClient categories={categories ?? []} />
    </SettingsPageShell>
  )
}
