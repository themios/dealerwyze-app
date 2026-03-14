/**
 * POST /api/settings/telegram/connect
 *   Generates a 6-digit verification code for the dealer to send to the bot.
 *   The code is stored in org_settings with a 15-minute expiry.
 *   When the dealer messages the code to the bot, the webhook links their
 *   Telegram chat_id to their org automatically.
 *
 * GET /api/settings/telegram/connect
 *   Returns { connected: boolean } — used by the Settings UI to check if
 *   the dealer has completed the verification flow.
 *
 * DELETE /api/settings/telegram/connect
 *   Disconnects Telegram — clears telegram_chat_id from org_settings.
 */
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

// ── GET — check connection status ─────────────────────────────────────────────

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data } = await supabase
    .from('org_settings')
    .select('telegram_chat_id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({ connected: !!data?.telegram_chat_id })
}

// ── POST — generate a verification code ──────────────────────────────────────

export async function POST() {
  const profile = await requireProfile()

  // Only dealer admins can connect Telegram
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Generate a 6-digit code (100000–999999)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min TTL

  const supabase = await createClientForRequest()

  // Always use .update() — never .upsert() (RLS blocks INSERT on org_settings)
  const { error } = await supabase
    .from('org_settings')
    .update({
      telegram_verify_code: code,
      telegram_verify_expires_at: expiresAt,
    })
    .eq('org_id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Could not generate code' }, { status: 500 })
  }

  return NextResponse.json({ code })
}

// ── DELETE — disconnect Telegram ──────────────────────────────────────────────

export async function DELETE() {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = await createClientForRequest()

  await supabase
    .from('org_settings')
    .update({
      telegram_chat_id: null,
      telegram_verify_code: null,
      telegram_verify_expires_at: null,
    })
    .eq('org_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
