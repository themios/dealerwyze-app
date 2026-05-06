import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { bookingLimiter } from '@/lib/rateLimit/upstash'
import { BookingSchema } from '@/lib/validation/schemas'
import { parseBody } from '@/lib/validation/parseRequest'

async function resolveOrgId(supabase: ReturnType<typeof createServiceClient>, slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug.toLowerCase().trim())
    .maybeSingle()
  return data?.id ?? null
}

// GET /api/book/[slug] — returns org booking info (public, no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const supabase = createServiceClient()

  const orgId = await resolveOrgId(supabase, slug)
  if (!orgId) return NextResponse.json({ error: 'Booking not available' }, { status: 404 })

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, business_phone, booking_enabled, booking_intro_text, timezone')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!settings || !settings.booking_enabled) {
    return NextResponse.json({ error: 'Booking not available' }, { status: 404 })
  }

  return NextResponse.json({
    dealer_name:   settings.business_name ?? 'Our Dealership',
    dealer_phone:  settings.business_phone ?? null,
    intro_text:    settings.booking_intro_text ?? null,
    timezone:      settings.timezone ?? 'America/Los_Angeles',
  })
}

// POST /api/book/[slug] — submit a booking request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await bookingLimiter(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many booking requests. Please wait a bit before trying again.' },
      { status: 429 },
    )
  }

  const { slug } = await params
  const supabase = createServiceClient()

  const orgId = await resolveOrgId(supabase, slug)
  if (!orgId) return NextResponse.json({ error: 'Booking not available' }, { status: 404 })

  // Verify booking is enabled
  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, booking_enabled, timezone')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!settings || !settings.booking_enabled) {
    return NextResponse.json({ error: 'Booking not available' }, { status: 404 })
  }

  let parsedBody: z.infer<typeof BookingSchema>
  try {
    parsedBody = await parseBody(req, BookingSchema)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }

  const { name, phone, email, date, time, notes, website } = parsedBody

  // Honeypot: bots fill hidden fields, real users don't
  if (website) return NextResponse.json({ success: true })

  const cleanName  = name.slice(0, 100)
  const cleanPhone = phone.replace(/\D/g, '').slice(0, 15)
  const cleanEmail = email?.slice(0, 200) ?? null
  const cleanNotes = notes?.slice(0, 500) ?? null

  // Parse appointment datetime in the dealer's timezone so UTC storage is correct.
  // e.g. "2026-05-10T14:00" interpreted as America/Chicago, not server UTC.
  const orgTimezone = settings.timezone ?? 'America/Los_Angeles'
  let appointmentAt: string
  try {
    // Build a date string with the timezone offset of the org at the given local time.
    const localIso = `${date}T${time}:00`
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: orgTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
      timeZoneName: 'longOffset',
    })
    // Use the offset the formatter gives us for this moment in that timezone.
    const offsetParts = formatter.formatToParts(new Date(localIso + 'Z'))
    const tzName = offsetParts.find(p => p.type === 'timeZoneName')?.value ?? 'UTC'
    // tzName is like "GMT-05:00" or "GMT+05:30"; convert to ±HH:MM
    const offset = tzName.replace('GMT', '') || '+00:00'
    appointmentAt = new Date(`${localIso}${offset}`).toISOString()
    if (isNaN(new Date(appointmentAt).getTime())) throw new Error('invalid')
  } catch {
    return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
  }

  // Find or create customer (scoped to org via user_id = org_id)
  const e164 = cleanPhone.startsWith('1') && cleanPhone.length === 11
    ? `+${cleanPhone}`
    : `+1${cleanPhone}`

  const { data: existing } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', orgId)
    .ilike('phone', `%${cleanPhone.slice(-10)}%`)
    .limit(1)
    .maybeSingle()

  let customerId: string

  if (existing) {
    customerId = existing.id
  } else {
    const { data: newCustomer, error: insertErr } = await supabase
      .from('customers')
      .insert({
        user_id: orgId,
        name:    cleanName,
        phone:   e164,
        email:   cleanEmail,
        source:  'booking_page',
      })
      .select('id')
      .single()

    if (insertErr || !newCustomer) {
      return NextResponse.json({ error: 'Could not save your request' }, { status: 500 })
    }
    customerId = newCustomer.id
  }

  // Create appointment activity
  const dealerName = settings.business_name ?? 'Dealership'
  const bodyText = [
    `Test drive appointment booked via the online booking page.`,
    cleanNotes ? `Note: ${cleanNotes}` : null,
  ].filter(Boolean).join('\n')

  await supabase.from('activities').insert({
    user_id:     orgId,
    customer_id: customerId,
    type:        'appointment',
    direction:   'inbound',
    body:        bodyText,
    priority:    'high',
    due_at:      appointmentAt,
  })

  // Create a follow-up task for the dealer (reuse already-parsed UTC timestamp)
  await supabase.from('tasks').insert({
    user_id:           orgId,
    linked_customer_id: customerId,
    task_type:         'appointment_confirm',
    title:             `Appointment: ${cleanName} – test drive`,
    priority:          'high',
    status:            'open',
    due_at:            appointmentAt,
    notes:             `Booked online. Phone: ${e164}${cleanEmail ? ` | Email: ${cleanEmail}` : ''}${cleanNotes ? ` | Note: ${cleanNotes}` : ''}`,
  })

  return NextResponse.json({ success: true, dealer_name: dealerName }, { status: 201 })
}
