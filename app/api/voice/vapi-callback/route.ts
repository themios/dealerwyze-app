import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processVoiceCall } from '@/lib/voice/ingest'

export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * VAPI post-call webhook.
 * Configure in VAPI dashboard: Assistants → your agent → Webhook URL:
 *   https://apollo-crm.vercel.app/api/voice/vapi-callback
 * Set webhook secret → same value as VAPI_WEBHOOK_SECRET env var.
 *
 * VAPI sends x-vapi-secret header for auth.
 */
export async function POST(req: NextRequest) {
  // Auth: VAPI sends the secret you configure in the dashboard
  const secret = req.headers.get('x-vapi-secret')
  if (secret !== process.env.VAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await req.json()

  // VAPI sends several message types — we only care about end-of-call-report
  const type = payload?.message?.type
  if (type !== 'end-of-call-report') {
    return NextResponse.json({ ok: true, skipped: type })
  }

  const msg  = payload.message
  const call = msg.call ?? {}

  const callId      = call.id ?? ''
  const fromNumber  = call.customer?.number ?? ''
  const toNumber    = call.phoneNumber?.number ?? ''
  const recordingUrl = msg.recordingUrl ?? call.recordingUrl ?? null
  const transcript  = msg.transcript ?? ''
  const endedReason = call.endedReason ?? ''

  // Duration from timestamps
  const startedAt = call.startedAt ? new Date(call.startedAt).getTime() : 0
  const endedAt   = call.endedAt   ? new Date(call.endedAt).getTime()   : Date.now()
  const duration  = startedAt ? Math.round((endedAt - startedAt) / 1000) : 0

  // Structured data extracted by VAPI (configured in assistant settings)
  const structured = msg.analysis?.structuredData ?? {}

  const name        = structured.caller_name      ?? ''
  const vehicle     = structured.vehicle_interest ?? ''
  const phone       = structured.callback_phone   ?? fromNumber
  const timeline    = structured.appointment_exact ?? structured.appointment_range ?? ''
  const location    = structured.location         ?? null
  const restricted  = structured.restricted_topics_attempted ?? []

  // Enrich summary_json with location + restricted topics for CRM display
  const summaryJson = {
    ...structured,
    location,
    restricted_topics_attempted: restricted,
  }

  const orgId = process.env.APOLLO_USER_ID!
  const supabase = createServiceClient()

  // Skip very short calls (< 10s) — likely hangups
  if (duration < 10 && !name) {
    return NextResponse.json({ ok: true, skipped: 'too_short' })
  }

  // Upsert voice_calls record
  await supabase.from('voice_calls').upsert(
    {
      org_id:          orgId,
      call_sid:        callId,
      from_number:     fromNumber,
      to_number:       toNumber,
      duration_seconds: duration,
      transcript,
      recording_url:   recordingUrl,
      status:          'completed',
      summary_json:    summaryJson ?? null,
    },
    { onConflict: 'call_sid' }
  )

  // Hand off to existing ingest pipeline (customer upsert, activity, task, push)
  processVoiceCall({
    call_sid:   callId,
    org_id:     orgId,
    from:       fromNumber,
    name,
    vehicle,
    phone,
    timeline,
    duration,
    transcript, // full VAPI transcript → Anthropic extraction
  }).catch(err => console.error('[vapi-callback] ingest error:', err))

  return NextResponse.json({ ok: true })
}
