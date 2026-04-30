import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/integrations/gmail
 * Clears Gmail credentials from org_settings (does not revoke Google token).
 */
export async function DELETE() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can disconnect Gmail' }, { status: 403 })
  }
  const supabase = await createClient()

  await supabase
    .from('org_settings')
    .update({
      gmail_refresh_token:  null,
      gmail_email:          null,
      gmail_last_polled_at: null,
      updated_at:           new Date().toISOString(),
    })
    .eq('org_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
