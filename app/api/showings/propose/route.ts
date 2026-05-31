/**
 * POST /api/showings/propose
 * Agent proposes a new time for a showing.
 * Sends SMS to buyer with proposed time.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({
  showing_id: z.string().uuid(),
  proposed_time: z.string().datetime(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const orgId = profile.org_id

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

  const { showing_id, proposed_time } = body

  // Fetch the showing request
  const { data: showing } = await supabase
    .from('showing_requests')
    .select(
      `id, agent_id, buyer_phone, listing_id`
    )
    .eq('id', showing_id)
    .eq('agent_id', profile.id)
    .maybeSingle()

  if (!showing) {
    return NextResponse.json(
      { error: 'Showing request not found' },
      { status: 404 }
    )
  }

  // Fetch listing for address
  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, zip')
    .eq('id', showing.listing_id)
    .maybeSingle()

  const address = listing
    ? [listing.address_line1, listing.city, listing.state, listing.zip]
        .filter(Boolean)
        .join(', ')
    : 'the property'

  // Send SMS to buyer with proposed time (don't update status yet)
  if (showing.buyer_phone) {
    fetch('/api/twilio/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: showing.buyer_phone,
        body: `We'd like to propose ${new Date(proposed_time).toLocaleString()} for your showing at ${address}. Does this work for you?`,
        org_id: orgId,
      }),
    }).catch((err) => console.error('Failed to send SMS:', err))
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
