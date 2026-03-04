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
    // Log signature failure to security_events (fire-and-forget)
    void createServiceClient().from('security_events').insert({
      event_type: 'sig_failure',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      details: { provider: 'retell', sig_header: sigHeader.slice(0, 60) },
    })
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

  // ── Per-caller daily abuse detection (Vector 7) ──────────────────────────
  // >2 calls from same number in 24h → log security_event + admin_alert
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: callerCount } = await supabase
    .from('voice_calls')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('from_number', fromNumber)
    .gte('created_at', yesterday)

  if ((callerCount ?? 0) >= 2) {
    void supabase.from('security_events').insert({
      event_type: 'caller_abuse',
      org_id: orgId,
      details: { from_number: fromNumber, calls_in_24h: (callerCount ?? 0) + 1, call_id: callId },
    })
    void supabase.from('admin_alerts').insert({
      org_id,
      alert_type: 'repeated_caller',
      severity: 'warning',
    }).maybeSingle()
  }

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

  // ── Voice monthly minute cap enforcement (Vector 7) ───────────────────────
  // Sum all call seconds this calendar month; if org > voice_minutes_cap → disable
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: orgCaps } = await supabase
    .from('org_settings')
    .select('voice_enabled, voice_minutes_cap')
    .eq('org_id', orgId)
    .maybeSingle()

  const cap = (orgCaps?.voice_minutes_cap ?? 60000)
  if (cap > 0 && (orgCaps?.voice_enabled !== false)) {
    const { data: monthSecs } = await supabase
      .from('voice_calls')
      .select('duration_seconds')
      .eq('org_id', orgId)
      .gte('created_at', monthStart.toISOString())
    const totalSecs = (monthSecs ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0)
    await supabase
      .from('org_settings')
      .update({ voice_minutes_month: totalSecs })
      .eq('org_id', orgId)
    if (totalSecs >= cap) {
      // Disable voice for remainder of billing cycle + alert
      await supabase.from('org_settings').update({ voice_enabled: false }).eq('org_id', orgId)
      void supabase.from('admin_alerts').insert({
        org_id,
        alert_type: 'voice_cap_reached',
        severity: 'warning',
      }).maybeSingle()
      console.warn(`[retell-callback] voice cap reached for org ${orgId}: ${totalSecs}s / ${cap}s`)
    }
  }

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
