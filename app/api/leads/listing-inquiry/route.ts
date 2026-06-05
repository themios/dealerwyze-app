/**
 * POST /api/leads/listing-inquiry
 * Unauthenticated public form — RE listing showing request from /[slug]/listings/[id].
 * Creates an activity in the agent CRM inbox + upserts customer record.
 * Public route: no auth, org_id resolved server-side from listing ownership — never trust client-supplied org_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'
import { notifyDealerNewLead } from '@/lib/vdp/notifyDealer'

const MAX_BODY_BYTES = 16_384

const Schema = z.object({
  org_id:     z.string().uuid(),
  listing_id: z.string().uuid(),
  name:       z.string().min(1).max(120).trim(),
  phone:      z.string().max(30).trim().optional(),
  email:      z.string().email().max(200).trim().optional(),
  message:    z.string().max(2000).trim().optional(),
  source_url: z.string().url().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed } = await webLeadLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const len = req.headers.get('content-length')
  if (len && /^\d+$/.test(len) && parseInt(len, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 400 })
  }

  let body: z.infer<typeof Schema>
  try {
    const raw = await req.json()
    const parsed = Schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { org_id, listing_id, name, phone, email, message, source_url } = body

  const supabase = createServiceClient()

  // Verify listing belongs to the claimed org — never trust client-supplied org_id alone.
  // We cross-check listing ownership so a bad actor cannot submit inquiries to random orgs.
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id, address_line1, city, state, user_id')
    .eq('id', listing_id)
    .eq('user_id', org_id)
    .in('status', ['available', 'pending'])
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Verify RE org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, public_inventory_enabled, vertical')
    .eq('id', org_id)
    .eq('vertical', 'real_estate')
    .eq('public_inventory_enabled', true)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const addrParts = [listing.address_line1, listing.city, listing.state].filter(Boolean)
  const listingLabel = addrParts.length > 0 ? addrParts.join(', ') : 'listing'

  // Create activity in agent CRM inbox
  const activityBody = [
    `Showing request from ${name}`,
    phone   ? `Phone: ${phone}`   : null,
    email   ? `Email: ${email}`   : null,
    `Property: ${listingLabel}`,
    message ? `Message: ${message}` : null,
  ].filter(Boolean).join('\n')

  await supabase.from('activities').insert({
    user_id:    org.id,
    vehicle_id: listing.id,
    type:       'appointment',
    direction:  'inbound',
    outcome:    'pending',
    body:       activityBody,
    priority:   'high',
  })

  // Also insert into inventory_inquiries for tracking
  await supabase.from('inventory_inquiries').insert({
    org_id:     org.id,
    vehicle_id: listing.id,
    name,
    email:      email ?? null,
    phone:      phone ?? null,
    message:    message ?? null,
    source_url: source_url ?? null,
  })

  // Upsert customer record
  let customerId: string | null = null
  if (phone || email) {
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, primary_phone, email')
      .eq('user_id', org.id)
      .is('merged_at', null)

    const normalPhone = phone?.replace(/\D/g, '') ?? ''
    const existing = allCustomers?.find(c => {
      if (normalPhone && c.primary_phone?.replace(/\D/g, '') === normalPhone) return true
      if (email && c.email?.toLowerCase() === email.toLowerCase()) return true
      return false
    })

    if (existing) {
      customerId = existing.id
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({
          user_id:     org.id,
          name,
          email:       email ?? null,
          primary_phone: phone ?? null,
          lead_source: 'web',
        })
        .select('id')
        .single()
      if (created) customerId = created.id
    }
  }

  if (customerId) {
    void applyLeadLocationDetection({ customerId, orgId: org.id, supabase })
      .then(() => applyAutoLeadAssignment({ customerId, orgId: org.id, supabase }))
      .catch(() => {})
  }

  notifyDealerNewLead(org.id, name, phone, message, `Showing request: ${listingLabel}`).catch(() => {})

  return NextResponse.json({ ok: true }, { status: 201 })
}
