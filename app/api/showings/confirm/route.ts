/**
 * POST /api/showings/confirm
 * Agent confirms a showing with a specific time.
 * Creates Google Calendar event if configured.
 * Sends SMS confirmation to buyer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createShowingCalendarEvent } from '@/lib/google-calendar/createShowingEvent'

const Schema = z.object({
  showing_id: z.string().uuid(),
  confirmed_time: z.string().datetime(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  let body: z.infer<typeof Schema>
  try {
    const raw = await req.json()
    const parsed = Schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { showing_id, confirmed_time } = body

  // Fetch the showing request (RLS will enforce agent ownership)
  const { data: showing } = await supabase
    .from('showing_requests')
    .select(
      `id, listing_id, agent_id, buyer_name, buyer_email, buyer_phone,
       message, status`
    )
    .eq('id', showing_id)
    .eq('agent_id', profile.id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json(
      { error: 'Showing request not found' },
      { status: 404 }
    )
  }

  // Fetch listing details
  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, zip')
    .eq('id', showing.listing_id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json(
      { error: 'Listing not found' },
      { status: 404 }
    )
  }

  const address = [
    listing.address_line1,
    listing.city,
    listing.state,
    listing.zip,
  ]
    .filter(Boolean)
    .join(', ')

  // Try to create Google Calendar event
  let calendarEventId: string | null = null
  try {
    calendarEventId = await createShowingCalendarEvent({
      orgId,
      agentId: showing.agent_id,
      showingRequestId: showing.id,
      buyerName: showing.buyer_name,
      buyerPhone: showing.buyer_phone ?? null,
      buyerEmail: showing.buyer_email ?? null,
      address,
      confirmedTime: confirmed_time,
      message: showing.message ?? null,
    })
  } catch (err) {
    console.error('Failed to create calendar event:', err)
    // Continue even if calendar fails — showing confirmation is more important
  }

  // Update showing_request in DB
  const { error: updateError } = await supabase
    .from('showing_requests')
    .update({
      status: 'confirmed',
      confirmed_time: confirmed_time,
      confirmed_at: new Date().toISOString(),
      google_calendar_event_id: calendarEventId ?? null,
    })
    .eq('id', showing_id)

  if (updateError) {
    console.error('Failed to update showing:', updateError)
    return NextResponse.json(
      { error: 'Failed to confirm showing' },
      { status: 500 }
    )
  }

  // Send SMS to buyer (best-effort, don't fail if it errors)
  if (showing.buyer_phone) {
    fetch('/api/twilio/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: showing.buyer_phone,
        body: `Great! Your showing is confirmed for ${new Date(confirmed_time).toLocaleString()}. We'll meet you at ${address}.`,
        org_id: orgId,
      }),
    }).catch((err) => console.error('Failed to send SMS:', err))
  }

  return NextResponse.json({ ok: true, event_id: calendarEventId }, { status: 200 })
}
