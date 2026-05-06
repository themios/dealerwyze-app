import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { createClient } from '@/lib/supabase/server'
import SettingsPageShell from '@/components/settings/SettingsPageShell'
import TransferPageClient from './TransferPageClient'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dealerwyze.com'

export default async function TransferPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) redirect('/settings')

  const supabase = await createClient()
  const { data } = await supabase
    .from('business_transfers')
    .select('id, new_owner_email, status, transfer_token, token_expires_at, data_snapshot, notes, created_at')
    .eq('org_id', profile.org_id)
    .in('status', ['pending_claim', 'pending_approval'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialTransfer = data ? {
    ...data,
    claim_url: `${APP_URL}/transfer/${data.transfer_token}`,
  } : null

  return (
    <SettingsPageShell
      title="Transfer Business Ownership"
      description="Transfer this dealership to a new owner through a controlled approval workflow."
      type="critical"
    >
      <TransferPageClient initialTransfer={initialTransfer} />
    </SettingsPageShell>
  )
}
