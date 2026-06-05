import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { createCalendarEvent } from '@/lib/google/calendar'
import { z } from 'zod'

export const runtime = 'nodejs'

const createSchema = z
  .object({
    listing_id: z.string().uuid(),
    scheduled_at: z.string().datetime(),
    contact_id: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
    showing_kind: z.enum(['client', 'open_house']).default('client'),
  })
  .superRefine((data, ctx) => {
    if (data.showing_kind === 'client' && !data.contact_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select a client for this showing',
        path: ['contact_id'],
      })
    }
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

  let contactName: string | null = null
  if (body.showing_kind === 'client' && body.contact_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', body.contact_id)
      .eq('user_id', profile.org_id)
      .eq('archived', false)
      .is('merged_at', null)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    contactName = customer.name
  }

  // Build insert payload — never touch showing_count (trigger owns it)
  const insertPayload: Record<string, unknown> = {
    org_id: profile.org_id,
    agent_id: profile.id,
    listing_id: body.listing_id,
    scheduled_at: body.scheduled_at,
    status: 'scheduled',
  }
  if (body.showing_kind === 'client' && body.contact_id) {
    insertPayload.contact_id = body.contact_id
  }
  if (body.notes) insertPayload.feedback_json = { notes: body.notes }

  const { data: showing, error } = await supabase
    .from('showings')
    .insert(insertPayload)
    .select('id, org_id, listing_id, contact_id, agent_id, scheduled_at, status, feedback_json, gcal_event_id, cal_booking_uid, cal_link, created_at')
    .single()

  if (error || !showing) {
    console.error('[showings] insert error:', error?.message)
    return NextResponse.json({ error: 'Failed to create showing' }, { status: 500 })
  }

  const address = listing.address_line1 ?? listing.model ?? 'Property'
  const summary =
    body.showing_kind === 'open_house'
      ? `Open house: ${address}`
      : contactName
        ? `Showing: ${address} — ${contactName}`
        : `Showing: ${address}`

  let gcalEventId: string | null = null
  try {
    const gcal = await createCalendarEvent(
      {
        summary,
        description: body.notes ?? '',
        startDateTimeIso: body.scheduled_at,
      },
      profile.org_id,
    )
    gcalEventId = gcal.eventId
    if (gcalEventId) {
      await supabase
        .from('showings')
        .update({ gcal_event_id: gcalEventId })
        .eq('id', showing.id)
        .eq('org_id', profile.org_id)
      showing.gcal_event_id = gcalEventId
    }
  } catch (gcalErr) {
    console.error('[showings] GCal create failed (non-fatal):', gcalErr)
  }

  await supabase.from('activities').insert({
    user_id: profile.org_id,
    customer_id: body.contact_id ?? null,
    vehicle_id: body.listing_id,
    type: 'appointment',
    direction: null,
    outcome: 'pending',
    priority: 'high',
    body: `${summary}${body.notes ? `\n\n${body.notes}` : ''}`,
    due_at: body.scheduled_at,
    google_calendar_event_id: gcalEventId,
  })

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
