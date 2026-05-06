import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { createClient } from '@/lib/supabase/server'

/**
 * Lists connected social accounts from social_accounts (OAuth flow, migration 089).
 *
 * This is the canonical source of truth for connected accounts — it's what the
 * OAuth callback populates. org_social_posting (migration 132) is a separate,
 * manually-configured table for the legacy posting settings and must NOT be used
 * to determine connection status.
 *
 * RBAC: excludes `dealer_rep`.
 */
export async function GET() {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  const [{ data: rows }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('id, platform, account_label, is_active')
      .eq('org_id', profile.org_id)
      .eq('is_active', true),
    supabase
      .from('org_settings')
      .select('social_hashtags, social_tagline, social_footer')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
  ])

  const accounts = (rows ?? []).map(r => ({
    id:            r.id as string,
    platform:      r.platform as string,
    account_label: r.account_label as string,
  }))

  const defaults = {
    social_hashtags: orgSettings?.social_hashtags ?? '',
    social_tagline:  orgSettings?.social_tagline  ?? '',
    social_footer:   orgSettings?.social_footer   ?? '',
  }

  return NextResponse.json({ accounts, defaults })
}

const UuidSchema = z.string().uuid()

/**
 * Soft-deletes a connected social account (sets is_active = false).
 * Called by SocialAccountsManager when the dealer clicks "Disconnect".
 *
 * DELETE /api/social/accounts?id=<uuid>
 */
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountId = req.nextUrl.searchParams.get('id') ?? ''
  if (!UuidSchema.safeParse(accountId).success) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 })
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('social_accounts')
    .update({ is_active: false, disconnected_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[social/accounts DELETE] db error:', error.message)
    return NextResponse.json({ error: 'Could not disconnect account' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
