import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { createCalendarEvent } from '@/lib/google/calendar'
import { z } from 'zod'

export const runtime = 'nodejs'

const createSchema = z.object({
  listing_id:   z.string().uuid(),
  scheduled_at: z.string().datetime(),
  contact_id:   z.string().uuid().optional(),
  notes:        z.string().max(2000).optional(),
})

/**
 * POST /api/showings
 * Create a showing for a listing. GCal event creation is best-effort.
 * showing_count is managed exclusively by the DB trigger trg_listing_showing_count.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const rawBody = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = parsed.data

  // Verify listing belongs to this org (own-or-404: don't leak existence to other orgs)
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id, address_line1, model')
    .eq('id', body.listing_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Build insert payload — never touch showing_count (trigger owns it)
  const insertPayload: Record<string, unknown> = {
    org_id:       profile.org_id,
    agent_id:     profile.id,
    listing_id:   body.listing_id,
    scheduled_at: body.scheduled_at,
    status:       'scheduled',
  }
  if (body.contact_id) insertPayload.contact_id = body.contact_id
  if (body.notes)      insertPayload.feedback_json = { notes: body.notes }

  const { data: showing, error } = await supabase
    .from('showings')
    .insert(insertPayload)
    .select('id, org_id, listing_id, contact_id, agent_id, scheduled_at, status, feedback_json, gcal_event_id, cal_booking_uid, cal_link, created_at')
    .single()

  if (error || !showing) {
    console.error('[showings] insert error:', error?.message)
    return NextResponse.json({ error: 'Failed to create showing' }, { status: 500 })
  }

  // GCal sync — best-effort, never blocks response
  try {
    const address = listing.address_line1 ?? listing.model ?? 'Property'
    const gcal = await createCalendarEvent(
      {
        summary:          `Showing: ${address}`,
        description:      body.notes ?? '',
        startDateTimeIso: body.scheduled_at,
      },
      profile.org_id,
    )
    if (gcal.eventId) {
      await supabase
        .from('showings')
        .update({ gcal_event_id: gcal.eventId })
        .eq('id', showing.id)
        .eq('org_id', profile.org_id)
      showing.gcal_event_id = gcal.eventId
    }
  } catch (gcalErr) {
    console.error('[showings] GCal create failed (non-fatal):', gcalErr)
  }

  return NextResponse.json(showing, { status: 201 })
}

/**
 * GET /api/showings?listing_id=X
 * Returns all showings for a listing scoped to the authenticated org.
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const listingId = req.nextUrl.searchParams.get('listing_id')
  if (!listingId) {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('showings')
    .select(
      'id, scheduled_at, status, feedback_json, gcal_event_id, cal_booking_uid, cal_link, created_at, agent_id, ' +
      'contact:customers(id, name, primary_phone, email)',
    )
    .eq('listing_id', listingId)
    .eq('org_id', profile.org_id)
    .order('scheduled_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[showings] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch showings' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
