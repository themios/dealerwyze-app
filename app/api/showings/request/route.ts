/**
 * POST /api/showings/request
 * Public endpoint for buyers to request a showing on a listing page.
 * Creates showing_request record, notifies agent, sends confirmation to buyer.
 * Completely unauthenticated — org_id validated server-side via listing ownership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { webLeadLimiter } from '@/lib/rateLimit/upstash'
import { sendNotificationEmail } from '@/lib/email/notify'
import { notifyAgentShowingRequest } from '@/lib/showings/notifyAgentShowingRequest'
import { getAgentContact } from '@/lib/showings/getAgentContact'

const MAX_BODY_BYTES = 8192

const Schema = z.object({
  org_id: z.string().uuid(),
  listing_id: z.string().uuid(),
  buyer_name: z.string().min(1).max(120).trim(),
  buyer_email: z.string().email().max(200).trim(),
  buyer_phone: z.string().max(30).trim().optional(),
  requested_times: z.array(z.string().datetime()).max(3).optional(), // ISO 8601 timestamps
  message: z.string().max(2000).trim().optional(),
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
      console.error('Schema validation failed:', parsed.error.issues)
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    body = parsed.data
  } catch (err) {
    console.error('JSON parse error:', err)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    org_id,
    listing_id,
    buyer_name,
    buyer_email,
    buyer_phone,
    requested_times,
    message,
    source_url,
  } = body

  const supabase = createServiceClient()

  // Verify listing belongs to the claimed org (never trust client-supplied org_id)
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id, address_line1, city, state, zip, listing_agent_id, user_id')
    .eq('id', listing_id)
    .eq('user_id', org_id)
    .in('status', ['available', 'pending'])
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Verify org is real_estate vertical
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

  // Verify agent exists and is in the same org
  if (!listing.listing_agent_id) {
    return NextResponse.json(
      { error: 'No agent assigned to this listing' },
      { status: 400 }
    )
  }

  const { data: agent } = await supabase
    .from('profiles')
    .select('id, display_name, org_id')
    .eq('id', listing.listing_agent_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Agent contact data is sourced from auth.users (profiles does not store email/phone).
  const agentContact = await getAgentContact(supabase, agent.id)
  const agentEmail = agentContact?.email ?? null
  const agentPhone = agentContact?.phone ?? null

  const addressParts = [listing.address_line1, listing.city, listing.state, listing.zip].filter(Boolean)
  const address = addressParts.join(', ')

  // Create showing_request record
  const { data: showingRequest, error: insertError } = await supabase
    .from('showing_requests')
    .insert({
      org_id,
      listing_id,
      agent_id: listing.listing_agent_id,
      buyer_name,
      buyer_email,
      buyer_phone: buyer_phone ?? null,
      requested_time_1: requested_times?.[0] ?? null,
      requested_time_2: requested_times?.[1] ?? null,
      requested_time_3: requested_times?.[2] ?? null,
      message: message ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !showingRequest) {
    console.error('Failed to create showing_request:', insertError)
    return NextResponse.json(
      { error: 'Failed to create showing request' },
      { status: 500 }
    )
  }

  // Notify agent using helper
  notifyAgentShowingRequest({
    orgId: org_id,
    agentId: agent.id,
    agentName: agent.display_name || 'Agent',
    agentPhone,
    agentEmail,
    buyerName: buyer_name,
    buyerEmail: buyer_email,
    buyerPhone: buyer_phone ?? null,
    address,
    showingId: showingRequest.id,
    requestedTimes: (requested_times ?? []).map((t) => t),
  }).catch((err) => console.error('Failed to notify agent:', err))

  // Send confirmation email to buyer
  const buyerEmailSubject = `Your showing request for ${address}`
  const buyerEmailBody = `Hi ${buyer_name},

Thank you for requesting a showing! ${agent.display_name} will confirm your preferred time shortly.

**Property:** ${address}
**Your preferred times:** ${
    [
      requested_times?.[0] ? new Date(requested_times[0]).toLocaleString() : null,
      requested_times?.[1] ? new Date(requested_times[1]).toLocaleString() : null,
      requested_times?.[2] ? new Date(requested_times[2]).toLocaleString() : null,
    ]
      .filter(Boolean)
      .join(', ') || 'flexible'
  }${message ? `\n**Your message:** ${message}` : ''}

We'll be in touch soon!

Best regards,
${org.name}`

  sendNotificationEmail({
    to: buyer_email,
    subject: buyerEmailSubject,
    html: buyerEmailBody.replace(/\n/g, '<br/>'),
  }).catch((err) => console.error('Failed to send email to buyer:', err))

  return NextResponse.json(
    {
      ok: true,
      message: 'Showing request received. You will hear from the agent shortly.',
    },
    { status: 201 }
  )
}
