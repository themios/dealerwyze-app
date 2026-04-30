/**
 * POST /api/leads/web
 * Unauthenticated web lead capture from public VDP pages.
 * Inserts into inventory_inquiries + creates an activity for the dealer CRM inbox.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyDealerNewLead } from '@/lib/vdp/notifyDealer'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'
import { WebLeadSchema, parseBody } from '@/lib/validation/schemas'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed } = await webLeadLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const parsed = await parseBody(req, WebLeadSchema)
  if (parsed.errorResponse) return parsed.errorResponse

  const { slug, vdp, name, email, phone, message, source_url, website } = parsed.data

  // Honeypot: bots fill hidden fields
  if (website) {
    return NextResponse.json({ ok: true }) // silent reject
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
  if (vdp) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id, year, make, model')
      .eq('public_slug', vdp)
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
    name,
    email: email ?? null,
    phone: phone ?? null,
    message: message ?? null,
    source_url: source_url ?? null,
  })

  // Create activity in dealer CRM inbox
  const activityBody = [
    `Web inquiry from ${name}`,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
    vehicleName ? `Vehicle: ${vehicleName}` : null,
    message ? `Message: ${message}` : null,
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
  notifyDealerNewLead(org.id, name, phone, message, vehicleName).catch(() => {})

  return NextResponse.json({ ok: true })
}
