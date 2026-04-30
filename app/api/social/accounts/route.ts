import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/social/accounts — list connected social accounts (no tokens returned)
export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, account_label, platform_account_id, page_id, instagram_business_account_id, is_active, connected_at, token_expires_at')
    .eq('org_id', profile.org_id)
    .order('platform')

  return NextResponse.json({ accounts: accounts ?? [] })
}

// DELETE /api/social/accounts?id=[accountId] — disconnect a platform account
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const accountId = new URL(req.url).searchParams.get('id')

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify ownership
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, org_id')
    .eq('id', accountId)
    .eq('org_id', profile.org_id)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabase.from('social_accounts').delete().eq('id', accountId)

  return NextResponse.json({ success: true })
}
