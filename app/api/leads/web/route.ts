/**
 * POST /api/leads/web
 * Unauthenticated web lead capture from public VDP pages.
 * For dealers: inserts into inventory_inquiries + creates an activity.
 * For RE: creates showing_requests if appointment times provided, auto-links property.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyDealerNewLead } from '@/lib/vdp/notifyDealer'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'
import { WebLeadSchema } from '@/lib/validation/schemas'
import { parseBody } from '@/lib/validation/parseRequest'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'

const MAX_WEB_LEAD_BODY_BYTES = 32_768

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed } = await webLeadLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const len = req.headers.get('content-length')
  if (len != null && /^\d+$/.test(len) && parseInt(len, 10) > MAX_WEB_LEAD_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { _body: 'Request body too large' } },
      { status: 400 },
    )
  }

  let data: z.infer<typeof WebLeadSchema>
  try {
    data = await parseBody(req, WebLeadSchema)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }

  const { slug, vdp, name, email, phone, message, source_url, website, requested_time_1, requested_time_2, requested_time_3 } = data

  // Honeypot: bots fill hidden fields
  if (website) {
    return NextResponse.json({ ok: true }) // silent reject
  }

  const supabase = createServiceClient()

  // Resolve org from public slug server-side. Public clients must not choose org IDs.
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, public_inventory_enabled, vertical')
    .eq('slug', slug.trim())
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isRealEstate = org.vertical === 'real_estate'

  // Resolve the published vehicle/property from the public route slug.
  let vehicleId: string | null = null
  let vehicleName: string | undefined
  if (vdp) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('id, year, make, model, address_line1, city, bedrooms, bathrooms')
      .eq('public_slug', vdp)
      .eq('user_id', org.id)
      .eq('published', true)
      .single()
    if (!v) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }
    vehicleId = v.id
    vehicleName = isRealEstate && v.address_line1
      ? `${v.address_line1}${v.city ? ', ' + v.city : ''} (${v.bedrooms || '?'}br/${v.bathrooms || '?'}ba)`
      : !isRealEstate
        ? `${v.year} ${v.make} ${v.model}`
        : 'Property'
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

  // Upsert customer so location detection has a customer_id to work with.
  // Match on phone first, then email; create if neither matches.
  let customerId: string | null = null
  if (phone || email) {
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, primary_phone, email')
      .eq('user_id', org.id)
      .is('merged_at', null)

    const normalPhone = phone?.replace(/\D/g, '') ?? ''
    const existing = allCustomers?.find(c => {
      if (normalPhone && c.primary_phone) {
        if (c.primary_phone.replace(/\D/g, '') === normalPhone) return true
      }
      if (email && c.email) {
        if (c.email.toLowerCase() === email.toLowerCase()) return true
      }
      return false
    })

    if (existing) {
      customerId = existing.id
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({
          user_id: org.id,
          name,
          email: email ?? null,
          primary_phone: phone ?? null,
          lead_source: 'web',
        })
        .select('id')
        .single()
      if (created) customerId = created.id
    }
  }

  // Handle RE-specific workflows (showings, property links)
  if (isRealEstate && vehicleId && customerId) {
    // Auto-link property to buyer (fire-and-forget)
    void (async () => {
      try {
        await supabase.from('customer_vehicles').upsert({
          customer_id: customerId,
          vehicle_id: vehicleId,
          interest_level: 'warm',
        }, { onConflict: 'customer_id,vehicle_id' })
      } catch {
        // silent fail
      }
    })()

    // Create showing_requests if appointment times provided
    if (requested_time_1 || requested_time_2 || requested_time_3) {
      void (async () => {
        try {
          // Find first available agent for the org
          const { data: agent } = await supabase
            .from('profiles')
            .select('id')
            .eq('org_id', org.id)
            .in('role', ['admin', 'agent'])
            .limit(1)
            .maybeSingle()

          if (agent) {
            const showingData = {
              org_id: org.id,
              listing_id: vehicleId,
              agent_id: agent.id,
              buyer_name: name,
              buyer_email: email ?? '',
              buyer_phone: phone ?? null,
              requested_time_1: requested_time_1 || null,
              requested_time_2: requested_time_2 || null,
              requested_time_3: requested_time_3 || null,
              message: message ?? null,
              status: 'pending',
            }
            await supabase.from('showing_requests').insert(showingData)
          }
        } catch {
          // silent fail
        }
      })()
    }
  }

  // Location detection + round-robin assignment (fire-and-forget) — for dealers only
  if (!isRealEstate && customerId) {
    void applyLeadLocationDetection({ customerId, orgId: org.id, supabase })
      .then(() => applyAutoLeadAssignment({ customerId, orgId: org.id, supabase }))
      .catch(() => {})
  }

  // Notify dealer/agent via SMS (fire and forget)
  notifyDealerNewLead(org.id, name, phone, message, vehicleName).catch(() => {})

  return NextResponse.json({ ok: true }, { status: 201 })
}
