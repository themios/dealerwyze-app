import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processVoiceCall } from '@/lib/voice/ingest'
import { getOrgIdByPhone, requireOrgId } from '@/lib/orgs/lookup'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * Validate Retell's X-Retell-Signature using HMAC-SHA256.
 * Retell signs: rawBody + timestamp (no separator)
 * Header format (Conversation Flow): "v=<timestamp_ms>,d=<hex_signature>"
 * Header format (legacy agent):      "t=<timestamp_s>,v1=<hex_signature>"
 * Spec: https://docs.retellai.com/features/secure-webhook
 */
function validateRetellSignature(secret: string, rawBody: string, header: string): boolean {
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const idx = p.indexOf('=')
      return idx === -1 ? [p, ''] : [p.slice(0, idx), p.slice(idx + 1)]
    })
  )
  // Support both header formats
  const ts  = parts['t']  ?? parts['v']
  const sig = parts['v1'] ?? parts['d']
  if (!ts || !sig) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false

  // Reject timestamps older than 5 minutes
  // v= is in milliseconds; t= is in seconds
  const tsMs = tsNum > 1e11 ? tsNum : tsNum * 1000
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false

  // Retell signs: rawBody + timestamp (no dot separator)
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody + ts)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

/**
 * Retell AI post-call webhook.
 * Configure in Retell dashboard → Webhook URL:
 *   https://dealerwyze.com/api/voice/retell-callback
 *
 * We listen for `call_analyzed` — the only event that includes
 * full transcript + call_analysis.custom_analysis_data.
 */
export async function POST(req: NextRequest) {
  // Always read as text so we can validate the HMAC before parsing
  const rawBody = await req.text()

  // Use RETELL_API_KEY (the key with webhook badge) — fallback to RETELL_WEBHOOK_SECRET
  const retellSecret = process.env.RETELL_API_KEY ?? process.env.RETELL_WEBHOOK_SECRET
  if (!retellSecret) {
    console.error('[retell-callback] Neither RETELL_API_KEY nor RETELL_WEBHOOK_SECRET set')
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 })
  }
  const sigHeader = req.headers.get('x-retell-signature') ?? ''
  if (!validateRetellSignature(retellSecret, rawBody, sigHeader)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try { payload = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload?.event
  // Only process fully analyzed calls
  if (event !== 'call_analyzed') {
    return NextResponse.json({ ok: true, skipped: event })
  }

  const call = payload.call ?? {}

  const callId     = call.call_id     ?? ''
  const fromNumber = call.from_number ?? ''
  const startTs    = call.start_timestamp ?? 0
  const endTs      = call.end_timestamp   ?? Date.now()
  const duration   = startTs ? Math.round((endTs - startTs) / 1000) : 0
  const transcript = call.transcript ?? ''

  // Skip very short calls (likely hangups)
  if (duration < 10) {
    return NextResponse.json({ ok: true, skipped: 'too_short' })
  }

  // Structured data extracted by Retell agent (custom_analysis_data)
  const analysis  = call.call_analysis ?? {}
  const custom    = analysis.custom_analysis_data ?? {}

  const name     = custom.caller_name      ?? ''
  const vehicle  = custom.vehicle_interest ?? ''
  const phone    = custom.callback_phone   ?? fromNumber
  const timeline = custom.appointment_exact ?? custom.appointment_range ?? ''

  // Resolve org from the Retell "to" number (multi-tenant ready)
  const toNumber = call.to_number ?? ''
  let orgId: string
  try {
    orgId = requireOrgId(await getOrgIdByPhone(toNumber))
  } catch {
    console.warn('[retell-callback] unknown phone, no org resolved', { toNumber })
    return new Response('OK', { status: 200 })
  }
  if (!orgId) {
    console.error('[retell-callback] Could not resolve org for toNumber', toNumber)
    return NextResponse.json({ ok: false, error: 'org_not_found' }, { status: 200 })
  }

  const supabase = createServiceClient()

  // Upsert voice_calls record
  await supabase.from('voice_calls').upsert(
    {
      org_id:           orgId,
      call_sid:         callId,
      from_number:      fromNumber,
      to_number:        toNumber,
      duration_seconds: duration,
      transcript,
      status:           'completed',
      summary_json:     Object.keys(custom).length > 0 ? custom : null,
    },
    { onConflict: 'call_sid' }
  )

  // Run after response is sent — prevents Vercel from killing it mid-flight
  after(
    processVoiceCall({
      call_sid:   callId,
      org_id:     orgId,
      from:       fromNumber,
      name,
      vehicle,
      phone,
      timeline,
      duration,
      transcript,
    }).catch(err => console.error('[retell-callback] ingest error:', err))
  )

  return NextResponse.json({ ok: true })
}
