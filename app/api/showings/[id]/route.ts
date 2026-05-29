import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { updateCalendarEvent } from '@/lib/google/calendar'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  status:         z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  scheduled_at:   z.string().datetime().optional(),
  feedback_notes: z.string().max(5000).optional(),
})

/**
 * PATCH /api/showings/[id]
 * Update status, reschedule, and/or write feedback notes for a showing.
 * GCal update is best-effort. showing_count is never touched here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { id } = await params

  // Fetch showing — own-or-404 (don't disclose existence to other orgs)
  const { data: showing } = await supabase
    .from('showings')
    .select('id, org_id, gcal_event_id, scheduled_at, status, feedback_json')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rawBody = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = parsed.data

  if (!body.status && !body.scheduled_at && body.feedback_notes === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {}
  if (body.status)       updatePayload.status = body.status
  if (body.scheduled_at) updatePayload.scheduled_at = body.scheduled_at
  if (body.feedback_notes !== undefined) {
    // Merge notes into existing feedback_json without clobbering other keys
    const existing = (showing.feedback_json ?? {}) as Record<string, unknown>
    updatePayload.feedback_json = { ...existing, notes: body.feedback_notes }
  }

  const { data: updated, error } = await supabase
    .from('showings')
    .update(updatePayload)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select('id, listing_id, contact_id, agent_id, scheduled_at, status, feedback_json, gcal_event_id, cal_booking_uid, cal_link, created_at')
    .single()

  if (error || !updated) {
    console.error('[showings] PATCH error:', error?.message)
    return NextResponse.json({ error: 'Failed to update showing' }, { status: 500 })
  }

  // GCal sync — best-effort, after DB update, never throws
  try {
    if (showing.gcal_event_id) {
      const isCancelled =
        body.status === 'cancelled' || body.status === 'no_show'

      if (isCancelled) {
        await updateCalendarEvent(profile.org_id, showing.gcal_event_id, { cancelled: true })
      } else if (body.scheduled_at) {
        await updateCalendarEvent(profile.org_id, showing.gcal_event_id, {
          startDateTimeIso: body.scheduled_at,
        })
      }
    }
  } catch (gcalErr) {
    console.error('[showings] GCal update failed (non-fatal):', gcalErr)
  }

  return NextResponse.json(updated)
}

/**
 * DELETE /api/showings/[id]
 * Hard-delete the showing. The DB trigger trg_listing_showing_count decrements
 * vehicles.showing_count automatically — this route must NOT touch showing_count.
 * GCal event is cancelled best-effort.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { id } = await params

  // Fetch showing — own-or-404
  const { data: showing } = await supabase
    .from('showings')
    .select('id, org_id, gcal_event_id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // GCal cancel — best-effort, before DB delete so we still have the event id
  if (showing.gcal_event_id) {
    try {
      await updateCalendarEvent(profile.org_id, showing.gcal_event_id, { cancelled: true })
    } catch (gcalErr) {
      console.error('[showings] GCal cancel failed (non-fatal):', gcalErr)
    }
  }

  const { error } = await supabase
    .from('showings')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[showings] DELETE error:', error.message)
    return NextResponse.json({ error: 'Failed to delete showing' }, { status: 500 })
  }

  // DB trigger fires on DELETE — showing_count decremented automatically
  return NextResponse.json({ deleted: true })
}
