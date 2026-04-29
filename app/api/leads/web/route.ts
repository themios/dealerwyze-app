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
    slug,
    vdp,
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

  if (!slug?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve org from public slug server-side. Public clients must not choose org IDs.
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, public_inventory_enabled')
    .eq('slug', slug.trim())
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve the published vehicle from the public route slug.
  let vehicleId: string | null = null
  let vehicleName: string | undefined
  if (vdp?.trim()) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id, year, make, model')
      .eq('public_slug', vdp.trim())
      .eq('user_id', org.id)
      .eq('published', true)
      .single()
    if (!v) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
    vehicleId = v.id
    vehicleName = `${v.year} ${v.make} ${v.model}`
  }

  // Insert into inventory_inquiries
  await supabase.from('inventory_inquiries').insert({
    org_id: org.id,
    vehicle_id: vehicleId,
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
    user_id: org.id,
    type: 'web_lead',
    direction: 'inbound',
    body: activityBody,
    priority: 'high',
    completed_at: new Date().toISOString(),
    ...(vehicleId ? { vehicle_id: vehicleId } : {}),
  })

  // Notify dealer via SMS (fire and forget)
  notifyDealerNewLead(
    org.id,
    name.trim(),
    phone?.trim(),
    message?.trim(),
    vehicleName
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
