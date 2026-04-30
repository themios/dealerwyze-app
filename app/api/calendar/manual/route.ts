import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createCalendarEvent } from '@/lib/google/calendar'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  let body: {
    title?: string
    description?: string
    start_at?: string
    duration_min?: number
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = String(body.title ?? '').trim().slice(0, 200)
  const description = String(body.description ?? '').trim().slice(0, 4000)
  const startAt = String(body.start_at ?? '')
  const durationMin = body.duration_min != null ? Math.max(15, Math.min(480, Math.round(Number(body.duration_min)))) : 60

  if (!title || !startAt) {
    return NextResponse.json({ error: 'title and start_at are required' }, { status: 400 })
  }

  const startDate = new Date(startAt)
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Invalid start_at' }, { status: 400 })
  }

  const result = await createCalendarEvent(
    {
      summary: title,
      description,
      startDateTimeIso: startDate.toISOString(),
      durationMin,
    },
    profile.org_id,
  )

  return NextResponse.json({ calendar_url: result.htmlLink, event_id: result.eventId })
}
