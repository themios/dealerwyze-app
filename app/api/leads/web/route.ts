/**
 * POST /api/leads/web
 * Unauthenticated web lead capture from public VDP pages.
 * Inserts into inventory_inquiries + creates an activity for the dealer CRM inbox.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyDealerNewLead } from '@/lib/vdp/notifyDealer'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed } = await webLeadLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const {
    org_id,
    vehicle_id,
    name,
    email,
    phone,
    message,
    source_url,
    website, // honeypot - must be absent or empty
  } = body as Record<string, string | undefined>

  // Honeypot: bots fill hidden fields
  if (website) {
    return NextResponse.json({ ok: true }) // silent reject
  }

  if (!org_id || !name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify org exists and has public inventory enabled
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, public_inventory_enabled')
    .eq('id', org_id)
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve vehicle name for notification (optional)
  let vehicleName: string | undefined
  if (vehicle_id) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('year, make, model')
      .eq('id', vehicle_id)
      .eq('user_id', org_id)
      .single()
    if (v) vehicleName = `${v.year} ${v.make} ${v.model}`
  }

  // Insert into inventory_inquiries
  await supabase.from('inventory_inquiries').insert({
    org_id,
    vehicle_id: vehicle_id || null,
    name: name.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    message: message?.trim() || null,
    source_url: source_url || null,
  })

  // Create activity in dealer CRM inbox
  const activityBody = [
    `Web inquiry from ${name.trim()}`,
    phone ? `Phone: ${phone.trim()}` : null,
    email ? `Email: ${email.trim()}` : null,
    vehicleName ? `Vehicle: ${vehicleName}` : null,
    message?.trim() ? `Message: ${message.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  await supabase.from('activities').insert({
    user_id: org_id,
    type: 'web_lead',
    direction: 'inbound',
    body: activityBody,
    priority: 'high',
    completed_at: new Date().toISOString(),
    ...(vehicle_id ? { vehicle_id } : {}),
  })

  // Notify dealer via SMS (fire and forget)
  notifyDealerNewLead(
    org_id,
    name.trim(),
    phone?.trim(),
    message?.trim(),
    vehicleName
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
