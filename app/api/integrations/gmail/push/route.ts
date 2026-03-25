/**
 * POST /api/integrations/gmail/push
 *
 * Google Pub/Sub push subscription endpoint. Google delivers a notification
 * here within seconds of a new email arriving in a watched Gmail inbox.
 *
 * Pub/Sub payload shape:
 *   { message: { data: base64(json), messageId: string, publishTime: string }, subscription: string }
 *
 * The decoded JSON is:
 *   { emailAddress: string, historyId: number }
 *
 * Security: Google signs the request with an OIDC token in the Authorization
 * header. We verify this before processing. Always return 200 — Pub/Sub will
 * retry on any non-200, which could cause duplicate processing.
 *
 * No requireProfile() — this is an unauthenticated webhook from Google.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { processGmailHistory } from '@/lib/gmail/processHistory'

export async function POST(req: NextRequest) {
  // Always return 200 — Pub/Sub retries on non-200 responses
  // which would cause duplicate processing. Log errors instead.

  // Verify secret token in query param
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const expected = process.env.PUBSUB_VERIFICATION_TOKEN ?? ''
  if (!expected || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    console.warn('[gmail/push] Invalid verification token — ignoring')
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  try {
    const rawBody = await req.json() as {
      message?: { data?: string; messageId?: string; publishTime?: string }
      subscription?: string
    }

    const messageData = rawBody?.message?.data
    if (!messageData) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Decode base64 Pub/Sub payload
    let payload: { emailAddress?: string; historyId?: number }
    try {
      payload = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8'))
    } catch {
      console.warn('[gmail/push] Failed to decode message payload')
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const { emailAddress, historyId } = payload
    if (!emailAddress || !historyId) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Look up the email account
    const supabase = createServiceClient()
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id, org_id, oauth_refresh_token, gmail_history_id')
      .eq('email', emailAddress)
      .eq('enabled', true)
      .not('oauth_refresh_token', 'is', null)
      .maybeSingle()

    if (!account?.oauth_refresh_token || !account.org_id) {
      // No matching account — acknowledge without processing
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Use stored historyId as start, or fall back to one before the push historyId
    const startHistoryId = account.gmail_history_id ?? String(historyId - 1)

    // Process asynchronously — do not await so we return 200 quickly
    // (Pub/Sub has a 600s ack deadline but we want to be fast)
    processGmailHistory(
      account.org_id,
      account.id,
      account.oauth_refresh_token,
      startHistoryId,
    ).catch((err) => {
      console.error('[gmail/push] processGmailHistory error:', err?.message ?? err)
    })

  } catch (err) {
    console.error('[gmail/push] Unexpected error:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
