import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

interface BookingBody {
  name: string
  phone: string
  email?: string
  date: string   // ISO date string (YYYY-MM-DD)
  time: string   // HH:MM (24h)
  notes?: string
}

// GET /api/book/[slug] — returns org booking info (public, no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, business_phone, booking_enabled, booking_intro_text, timezone')
    .eq('org_id', slug)
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
  const { slug } = await params
  const supabase = createServiceClient()

  // Verify booking is enabled
  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, booking_enabled')
    .eq('org_id', slug)
    .maybeSingle()

  if (!settings || !settings.booking_enabled) {
    return NextResponse.json({ error: 'Booking not available' }, { status: 404 })
  }

  let body: BookingBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { name, phone, email, date, time, notes } = body

  if (!name?.trim() || !phone?.trim() || !date || !time) {
    return NextResponse.json({ error: 'Name, phone, date, and time are required' }, { status: 400 })
  }

  // Sanitize inputs
  const cleanName  = name.trim().slice(0, 100)
  const cleanPhone = phone.replace(/\D/g, '').slice(0, 15)
  const cleanEmail = email?.trim().slice(0, 200) ?? null
  const cleanNotes = notes?.trim().slice(0, 500) ?? null

  if (cleanPhone.length < 10) {
    return NextResponse.json({ error: 'Please enter a valid phone number' }, { status: 400 })
  }

  // Parse appointment datetime (naive — store as ISO string)
  const appointmentAt = new Date(`${date}T${time}:00`).toISOString()
  if (isNaN(new Date(appointmentAt).getTime())) {
    return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 })
  }

  // Find or create customer (scoped to org via user_id = org_id)
  const e164 = cleanPhone.startsWith('1') && cleanPhone.length === 11
    ? `+${cleanPhone}`
    : `+1${cleanPhone}`

  const orgFilter = `user_id.eq.${slug}`
  const { data: existing } = await supabase
    .from('customers')
    .select('id, name')
    .or(orgFilter)
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
        user_id: slug,
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
    user_id:      slug,
    customer_id:  customerId,
    type:         'appointment',
    direction:    'inbound',
    body:         bodyText,
    priority:     'high',
    completed_at: appointmentAt,
  })

  // Create a follow-up task for the dealer
  const apptDate = new Date(`${date}T${time}:00`)
  await supabase.from('tasks').insert({
    user_id:           slug,
    linked_customer_id: customerId,
    task_type:         'appointment_confirm',
    title:             `Appointment: ${cleanName} – test drive`,
    priority:          'high',
    status:            'open',
    due_at:            apptDate.toISOString(),
    notes:             `Booked online. Phone: ${e164}${cleanEmail ? ` | Email: ${cleanEmail}` : ''}${cleanNotes ? ` | Note: ${cleanNotes}` : ''}`,
  })

  return NextResponse.json({ success: true, dealer_name: dealerName })
}
