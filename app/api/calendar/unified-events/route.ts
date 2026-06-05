/**
 * GET /api/calendar/unified-events?from=ISO&to=ISO
 * Merged feed for CRM calendar UI: activities, confirmed showing requests, scheduled showings.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export type UnifiedCalendarEvent = {
  id: string
  source: 'activity' | 'showing_request' | 'showing'
  title: string
  subtitle: string | null
  start: string
  href: string | null
  color: string
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

  const fromParam = req.nextUrl.searchParams.get('from')
  const toParam = req.nextUrl.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : new Date()
  from.setHours(0, 0, 0, 0)
  const to = toParam
    ? new Date(toParam)
    : new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const events: UnifiedCalendarEvent[] = []

  const { data: activities } = await supabase
    .from('activities')
    .select('id, due_at, body, direction, customer:customers(id, name)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .not('due_at', 'is', null)
    .gte('due_at', fromIso)
    .lte('due_at', toIso)
    .order('due_at', { ascending: true })

  for (const a of activities ?? []) {
    const customer = Array.isArray(a.customer) ? a.customer[0] : a.customer
    const pending = a.direction === 'inbound'
    events.push({
      id: `activity-${a.id}`,
      source: 'activity',
      title: customer?.name ? `Appointment — ${customer.name}` : 'Appointment',
      subtitle: a.body?.split('\n')[0]?.slice(0, 80) ?? null,
      start: a.due_at as string,
      href: customer?.id ? `/customers/${customer.id}` : null,
      color: pending ? 'bg-amber-500' : 'bg-blue-500',
    })
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', orgId)
    .maybeSingle()

  if (org?.vertical === 'real_estate') {
    const { data: requests } = await supabase
      .from('showing_requests')
      .select(
        `id, confirmed_time, buyer_name, status,
         listing:vehicles(id, address_line1, city, state)`,
      )
      .eq('org_id', orgId)
      .eq('status', 'confirmed')
      .not('confirmed_time', 'is', null)
      .gte('confirmed_time', fromIso)
      .lte('confirmed_time', toIso)

    for (const sr of requests ?? []) {
      const listing = Array.isArray(sr.listing) ? sr.listing[0] : sr.listing
      const addr = listing
        ? [listing.address_line1, listing.city, listing.state].filter(Boolean).join(', ')
        : 'Property'
      const linkedActivity = (activities ?? []).some((a) =>
        (a.body as string | null)?.includes(sr.id as string),
      )
      if (linkedActivity) continue

      events.push({
        id: `showing-request-${sr.id}`,
        source: 'showing_request',
        title: `Showing — ${sr.buyer_name}`,
        subtitle: addr,
        start: sr.confirmed_time as string,
        href: `/showings/${sr.id}`,
        color: 'bg-emerald-600',
      })
    }

    const { data: scheduled } = await supabase
      .from('showings')
      .select(
        `id, scheduled_at, status, contact:customers(id, name),
         listing:vehicles(id, address_line1, city)`,
      )
      .eq('org_id', orgId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)

    for (const s of scheduled ?? []) {
      const contact = Array.isArray(s.contact) ? s.contact[0] : s.contact
      const listing = Array.isArray(s.listing) ? s.listing[0] : s.listing
      const addr = listing?.address_line1 ?? 'Listing'
      events.push({
        id: `showing-${s.id}`,
        source: 'showing',
        title: contact?.name ? `Showing — ${contact.name}` : `Showing @ ${addr}`,
        subtitle: addr,
        start: s.scheduled_at as string,
        href: listing?.id ? `/listings/${listing.id}` : null,
        color: 'bg-violet-600',
      })
    }
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({ events })
}
