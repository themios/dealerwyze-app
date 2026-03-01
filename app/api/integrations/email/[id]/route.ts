import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/integrations/email/[id]
 * Remove an email account. Org check ensures users can't delete other orgs' accounts.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id }  = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('email_accounts')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
