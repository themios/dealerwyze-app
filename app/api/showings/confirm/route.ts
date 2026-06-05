/**
 * POST /api/showings/confirm
 * Agent confirms a showing with a specific time.
 * Creates Google Calendar event if configured.
 * Sends SMS confirmation to buyer.
 * Optional `include_video`: attach existing tour or queue Remotion Lambda render.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isoDateTime } from '@/lib/showings/isoDateTime'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { syncConfirmedShowingToCalendar } from '@/lib/showings/syncConfirmedShowingToCalendar'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'
import {
  resolveShowingConfirmationVideo,
  sendShowingConfirmationEmail,
} from '@/lib/showings/confirmationVideo'

const Schema = z.object({
  showing_id: z.string().uuid(),
  confirmed_time: isoDateTime,
  include_video: z.boolean().optional().default(false),
  template_id: z.string().uuid().optional(),
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

  const { showing_id, confirmed_time, include_video, template_id } = body

  const { data: showing } = await supabase
    .from('showing_requests')
    .select(
      `id, listing_id, agent_id, buyer_name, buyer_email, buyer_phone,
       message, status`,
    )
    .eq('id', showing_id)
    .eq('agent_id', profile.id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json(
      { error: 'Showing request not found' },
      { status: 404 },
    )
  }

  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, zip')
    .eq('id', showing.listing_id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json(
      { error: 'Listing not found' },
      { status: 404 },
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

  let calendarEventId: string | null = null
  try {
    const synced = await syncConfirmedShowingToCalendar({
      supabase,
      orgId,
      listingId: showing.listing_id,
      showingRequestId: showing.id,
      buyerName: showing.buyer_name,
      buyerEmail: showing.buyer_email,
      buyerPhone: showing.buyer_phone ?? null,
      address,
      confirmedTime: confirmed_time,
      message: showing.message ?? null,
    })
    calendarEventId = synced.googleCalendarEventId
  } catch (err) {
    console.error('Failed to sync showing to calendar:', err)
  }

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
      { status: 500 },
    )
  }

  let videoUrl: string | undefined
  let videoPending = false
  let videoRenderId: string | undefined

  if (include_video) {
    try {
      const video = await resolveShowingConfirmationVideo(supabase, {
        orgId,
        listingId: showing.listing_id,
        showingRequestId: showing.id,
        triggeredByUser: profile.id,
        templateId: template_id,
      })
      videoUrl = video.videoUrl
      videoPending = video.pending
      videoRenderId = video.renderId
    } catch (err) {
      console.error('[showings/confirm] video render failed:', err)
    }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  if (showing.buyer_email) {
    sendShowingConfirmationEmail({
      showing: { ...showing, org_id: orgId, confirmed_time },
      address,
      confirmedTime: confirmed_time,
      orgName: org?.name ?? 'RealtyWyze',
      videoUrl,
      videoPending,
    }).catch((err) => console.error('Failed to send showing confirmation email:', err))
  }

  if (showing.buyer_phone) {
    const smsBody = videoUrl
      ? `Great! Your showing is confirmed for ${new Date(confirmed_time).toLocaleString()} at ${address}. Tour video: ${videoUrl}`
      : `Great! Your showing is confirmed for ${new Date(confirmed_time).toLocaleString()}. We'll meet you at ${address}.`

    const buyerE164 = toE164Us(showing.buyer_phone)
    if (buyerE164) {
      sendTwilioSms(buyerE164, smsBody).catch((err) => console.error('Failed to send SMS:', err))
    }
  }

  return NextResponse.json(
    {
      ok: true,
      event_id: calendarEventId,
      video_render_id: videoRenderId ?? null,
      video_url: videoUrl ?? null,
      video_pending: videoPending,
    },
    { status: 200 },
  )
}
